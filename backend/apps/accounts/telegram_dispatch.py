"""Telegram update dispatcher — the bot's brain, shared by both run modes.

  * Long polling (local dev): ``python manage.py run_bot`` loops getUpdates and
    feeds each update to :meth:`TelegramBot.handle_update`.
  * Webhook (production): Telegram POSTs updates to the web service, and the
    ``telegram_webhook`` view calls the same :meth:`handle_update`. No always-on
    worker, and the handler shares the web app's database — so booking actions
    resolve against the same data the API writes.

Keeping the logic here (rather than in the management command) lets both entry
points reuse it without duplication.
"""
import requests
from django.conf import settings
from django.utils import timezone

# Master statuses that still need attention (shown in the bot's bookings list).
ACTIVE_STATUSES = ("pending", "confirmed", "in_progress")

API = "https://api.telegram.org/bot{token}/{method}"

WELCOME = (
    "✂️ <b>Barber</b> — ustangizni toping va navbatsiz bron qiling.\n\n"
    "Boshlash uchun pastdagi tugmani bosing."
)


class TelegramBot:
    """Stateless-ish handler holding the bot token + Mini App URL."""

    def __init__(self, token=None, webapp_url=None):
        self.token = token if token is not None else settings.TELEGRAM_BOT_TOKEN
        self.url = webapp_url if webapp_url is not None else settings.WEBAPP_URL

    # ------------------------------------------------------------------ #
    #  One-time setup (menu button + slash commands).                     #
    # ------------------------------------------------------------------ #
    def setup(self):
        self._call("setChatMenuButton", {
            "menu_button": {
                "type": "web_app",
                "text": "Ochish",
                "web_app": {"url": self.url},
            }
        })
        self._call("setMyCommands", {
            "commands": [
                {"command": "start", "description": "Ilovani ochish"},
                {"command": "bronlar", "description": "Bronlar (usta)"},
            ]
        })

    def get_username(self):
        me = self._call("getMe", {})
        return (me or {}).get("result", {}).get("username", "?")

    # ------------------------------------------------------------------ #
    #  Update dispatch.                                                    #
    # ------------------------------------------------------------------ #
    def handle_update(self, upd):
        # Inline-button taps (booking confirmation, rating stars) arrive as
        # callback queries rather than messages.
        callback = upd.get("callback_query")
        if callback:
            self._handle_callback(callback)
            return

        message = upd.get("message") or {}
        text = message.get("text", "")
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        if not chat_id:
            return

        # Phone shared via the Mini App's requestContact / a request_contact button.
        contact = message.get("contact")
        if contact and contact.get("phone_number"):
            sender_id = (message.get("from") or {}).get("id")
            self._save_contact(contact, sender_id)
            self._call("sendMessage", {
                "chat_id": chat_id,
                "text": "✅ Raqamingiz saqlandi. Ilovaga qaytishingiz mumkin.",
            })
            return

        # Master pulls up their bookings list (also reachable via the /start button).
        if text.startswith("/bronlar"):
            self._send_master_bookings(chat_id, chat_id)
            return

        if text.startswith("/start"):
            base = self.url.rstrip("/")
            # Deep link `t.me/<bot>?start=<handle>` — a master shares this so a
            # client lands straight on their booking page.
            parts = text.split(maxsplit=1)
            param = parts[1].strip() if len(parts) > 1 else ""
            if param:
                master = self._master_by_handle(param)
                if master:
                    self._call("sendMessage", {
                        "chat_id": chat_id,
                        "text": f"💈 <b>{master.display_name}</b> — bron qilish uchun tugmani bosing.",
                        "parse_mode": "HTML",
                        "reply_markup": {"inline_keyboard": [[
                            {"text": f"📅 {master.display_name} — bron qilish",
                             "web_app": {"url": f"{base}/m/{master.handle}"}}
                        ]]},
                    })
                    return

            recents = self._recent_masters(chat_id)
            rows = [[{"text": "💈 Ilovani ochish", "web_app": {"url": self.url}}]]
            # Masters get a one-tap shortcut to manage their incoming bookings.
            if self._is_master(chat_id):
                rows.append([{"text": "📋 Bronlar", "callback_data": "bookings"}])
            # One-tap re-booking with masters the user has visited before.
            for handle, name in recents:
                rows.append([
                    {"text": f"↻ {name}", "web_app": {"url": f"{base}/m/{handle}"}}
                ])
            extra = (
                "\n\n♻️ <b>Avvalgi ustalaringiz</b> — qayta bron qilish uchun pastdan tanlang."
                if recents else ""
            )
            self._call("sendMessage", {
                "chat_id": chat_id,
                "text": WELCOME + extra,
                "parse_mode": "HTML",
                "reply_markup": {"inline_keyboard": rows},
            })

    def _save_contact(self, contact, sender_id=None):
        """Attach a shared phone number to the matching Telegram user.

        Some clients omit ``contact.user_id`` when a user shares their own
        number; in a private chat the message sender is that same user, so fall
        back to ``sender_id``.
        """
        from apps.accounts.models import User

        tg_id = contact.get("user_id") or sender_id
        phone = contact.get("phone_number")
        if not tg_id:
            return
        if not phone.startswith("+"):
            phone = "+" + phone
        user = User.objects.filter(telegram_id=tg_id).first()
        if not user:
            return
        if not User.objects.exclude(pk=user.pk).filter(phone=phone).exists():
            user.phone = phone
        user.is_phone_verified = True
        user.is_registered = True
        user.save(update_fields=["phone", "is_phone_verified", "is_registered"])

    # ------------------------------------------------------------------ #
    #  Inline buttons: master confirms a booking, client rates a visit.    #
    # ------------------------------------------------------------------ #
    def _handle_callback(self, callback):
        from apps.bookings.models import Booking

        cq_id = callback.get("id")
        data = callback.get("data", "")
        from_id = (callback.get("from") or {}).get("id")
        msg = callback.get("message") or {}
        chat_id = (msg.get("chat") or {}).get("id")
        message_id = msg.get("message_id")
        parts = data.split(":")
        action = parts[0]

        # "bookings" — master taps the list button; no booking id attached.
        if action == "bookings":
            self._answer_callback(cq_id)
            self._send_master_bookings(chat_id, from_id)
            return

        # rate:<booking_id>:<stars>
        if action == "rate" and len(parts) == 3:
            self._handle_rate(cq_id, chat_id, message_id, from_id, parts[1], parts[2])
            return

        # Master status actions: <action>:<booking_id>
        status_map = {
            "confirm": Booking.Status.CONFIRMED,
            "start": Booking.Status.IN_PROGRESS,
            "done": Booking.Status.COMPLETED,
            "cancel": Booking.Status.CANCELLED,
        }
        if action in status_map and len(parts) == 2:
            self._handle_master_action(
                cq_id, chat_id, message_id, from_id, parts[1], status_map[action]
            )
            return

        self._answer_callback(cq_id)

    def _handle_master_action(self, cq_id, chat_id, message_id, from_id, booking_id, new_status):
        from apps.bookings.models import Booking
        from apps.bookings.tg import booking_text, master_keyboard

        booking = (
            Booking.objects.filter(id=booking_id)
            .select_related("master__user", "client", "service")
            .first()
        )
        if not booking:
            self._answer_callback(cq_id, "Bron topilmadi", alert=True)
            return
        if booking.master.user.telegram_id != from_id:
            self._answer_callback(cq_id, "Ruxsat yo'q", alert=True)
            return
        # A booking can't be started before its scheduled time.
        if new_status == Booking.Status.IN_PROGRESS and timezone.now() < booking.start_at:
            self._answer_callback(
                cq_id, "Belgilangan vaqtidan oldin boshlab bo'lmaydi", alert=True
            )
            return
        booking.status = new_status
        # Saving fires the post_save signal which notifies the client (and, on
        # completion, sends them the rating buttons).
        booking.save(update_fields=["status", "updated_at"])
        self._edit_message(
            chat_id, message_id, booking_text(booking), master_keyboard(booking)
        )
        self._answer_callback(cq_id, "Bajarildi ✅")

    def _handle_rate(self, cq_id, chat_id, message_id, from_id, booking_id, stars):
        from apps.bookings.models import Booking
        from apps.masters.models import Review

        booking = (
            Booking.objects.filter(id=booking_id).select_related("master", "client").first()
        )
        if not booking:
            self._answer_callback(cq_id, "Bron topilmadi", alert=True)
            return
        if booking.client.telegram_id != from_id:
            self._answer_callback(cq_id, "Ruxsat yo'q", alert=True)
            return
        try:
            rating = max(1, min(5, int(stars)))
        except ValueError:
            self._answer_callback(cq_id)
            return
        Review.objects.update_or_create(
            master=booking.master, author=booking.client, defaults={"rating": rating}
        )
        booking.master.recompute_rating()
        self._edit_message(
            chat_id, message_id, f"🙏 Rahmat! Siz {rating}⭐ baho berdingiz.", None
        )
        self._answer_callback(cq_id, "Baholandi ✅")

    def _is_master(self, tg_id):
        """True if this Telegram user owns a master profile."""
        from apps.masters.models import MasterProfile

        return MasterProfile.objects.filter(user__telegram_id=tg_id).exists()

    def _master_by_handle(self, handle):
        """Look up a master by their @handle (for share deep links)."""
        from apps.masters.models import MasterProfile

        return MasterProfile.objects.filter(handle=handle).first()

    def _send_master_bookings(self, chat_id, from_id):
        """Send the master their active bookings, each with action buttons
        (Tasdiqlash / Rad etish / Boshlash …)."""
        from apps.bookings.tg import booking_text, master_keyboard
        from apps.masters.models import MasterProfile

        master = (
            MasterProfile.objects.filter(user__telegram_id=from_id)
            .select_related("user")
            .first()
        )
        if not master:
            self._call("sendMessage", {
                "chat_id": chat_id,
                "text": "Siz hali usta emassiz. Usta bo'lish uchun ilovada profil yarating.",
            })
            return

        bookings = list(
            master.bookings.filter(status__in=ACTIVE_STATUSES)
            .select_related("client", "service")
            .prefetch_related("services")
            .order_by("start_at")
        )
        if not bookings:
            self._call("sendMessage", {
                "chat_id": chat_id,
                "text": "📋 Hozircha faol bronlaringiz yo'q.",
            })
            return

        self._call("sendMessage", {
            "chat_id": chat_id,
            "text": f"📋 <b>Faol bronlaringiz</b> — {len(bookings)} ta",
            "parse_mode": "HTML",
        })
        for b in bookings:
            payload = {
                "chat_id": chat_id,
                "text": booking_text(b),
                "parse_mode": "HTML",
            }
            kb = master_keyboard(b)
            if kb:
                payload["reply_markup"] = kb
            self._call("sendMessage", payload)

    def _recent_masters(self, tg_id, limit=5):
        """Distinct masters this Telegram user has booked, most recent first."""
        from apps.accounts.models import User
        from apps.bookings.models import Booking

        user = User.objects.filter(telegram_id=tg_id).first()
        if not user:
            return []
        out, seen = [], set()
        qs = Booking.objects.filter(client=user).select_related("master").order_by("-created_at")
        for b in qs:
            if b.master.handle in seen:
                continue
            seen.add(b.master.handle)
            out.append((b.master.handle, b.master.display_name))
            if len(out) >= limit:
                break
        return out

    # ------------------------------------------------------------------ #
    #  Low-level Telegram API helpers.                                    #
    # ------------------------------------------------------------------ #
    def _answer_callback(self, cq_id, text=None, alert=False):
        payload = {"callback_query_id": cq_id}
        if text:
            payload["text"] = text
            payload["show_alert"] = alert
        self._call("answerCallbackQuery", payload)

    def _edit_message(self, chat_id, message_id, text, reply_markup):
        payload = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": "HTML",
        }
        # Omitting reply_markup removes the inline keyboard (terminal states).
        if reply_markup:
            payload["reply_markup"] = reply_markup
        self._call("editMessageText", payload)

    def call(self, method, payload, timeout=10):
        """Public Telegram API call (used by the polling loop for getUpdates)."""
        return self._call(method, payload, timeout=timeout)

    def _call(self, method, payload, timeout=10):
        r = requests.post(API.format(token=self.token, method=method), json=payload, timeout=timeout)
        return r.json()
