"""Minimal Telegram bot: on /start it opens the Mini App.

Long-polls getUpdates (no webhook needed) and replies to /start with a button
that launches the Web App. Also sets the persistent chat menu button.

Run it alongside the API server:

    python manage.py run_bot

Requires in backend/.env:
    TELEGRAM_BOT_TOKEN=...        # from @BotFather
    WEBAPP_URL=https://...        # public HTTPS URL of the frontend (Mini App)

For local testing expose the frontend over HTTPS (ngrok / cloudflared) and set
WEBAPP_URL to that tunnel URL. web_app buttons require HTTPS.
"""
import time

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

# Master statuses that still need attention (shown in the bot's bookings list).
ACTIVE_STATUSES = ("pending", "confirmed", "in_progress")

API = "https://api.telegram.org/bot{token}/{method}"

WELCOME = (
    "✂️ <b>Barber</b> — ustangizni toping va navbatsiz bron qiling.\n\n"
    "Boshlash uchun pastdagi tugmani bosing."
)


class Command(BaseCommand):
    help = "Telegram botni ishga tushiradi (/start -> Mini App ochiladi)"

    def handle(self, *args, **options):
        token = settings.TELEGRAM_BOT_TOKEN
        url = settings.WEBAPP_URL
        if not token:
            raise CommandError("TELEGRAM_BOT_TOKEN .env da sozlanmagan.")
        if not url.startswith("https://"):
            self.stderr.write(
                self.style.WARNING(
                    f"WEBAPP_URL HTTPS bo'lishi kerak (hozir: {url}). "
                    "web_app tugmasi faqat HTTPS bilan ishlaydi."
                )
            )

        self._call(token, "setChatMenuButton", {
            "menu_button": {
                "type": "web_app",
                "text": "Ochish",
                "web_app": {"url": url},
            }
        })

        # Slash-command menu — masters can pull their bookings list via /bronlar.
        self._call(token, "setMyCommands", {
            "commands": [
                {"command": "start", "description": "Ilovani ochish"},
                {"command": "bronlar", "description": "Bronlar (usta)"},
            ]
        })

        me = self._call(token, "getMe", {})
        username = (me or {}).get("result", {}).get("username", "?")
        self.stdout.write(self.style.SUCCESS(f"Bot @{username} ishlamoqda. To'xtatish: Ctrl+C"))

        offset = None
        while True:
            try:
                resp = self._call(
                    token, "getUpdates", {"timeout": 30, "offset": offset}, timeout=35
                )
                for upd in (resp or {}).get("result", []):
                    offset = upd["update_id"] + 1
                    self._handle_update(token, url, upd)
            except requests.RequestException as exc:
                self.stderr.write(f"Tarmoq xatosi: {exc}")
                time.sleep(3)
            except KeyboardInterrupt:
                self.stdout.write("\nTo'xtatildi.")
                break

    def _handle_update(self, token, url, upd):
        # Inline-button taps (booking confirmation, rating stars) arrive as
        # callback queries rather than messages.
        callback = upd.get("callback_query")
        if callback:
            self._handle_callback(token, callback)
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
            self._save_contact(contact)
            self._call(token, "sendMessage", {
                "chat_id": chat_id,
                "text": "✅ Raqamingiz saqlandi. Ilovaga qaytishingiz mumkin.",
            })
            return

        # Master pulls up their bookings list (also reachable via the /start button).
        if text.startswith("/bronlar"):
            self._send_master_bookings(token, chat_id, chat_id)
            return

        if text.startswith("/start"):
            recents = self._recent_masters(chat_id)
            rows = [[{"text": "💈 Ilovani ochish", "web_app": {"url": url}}]]
            # Masters get a one-tap shortcut to manage their incoming bookings.
            if self._is_master(chat_id):
                rows.append([{"text": "📋 Bronlar", "callback_data": "bookings"}])
            # One-tap re-booking with masters the user has visited before.
            base = url.rstrip("/")
            for handle, name in recents:
                rows.append([
                    {"text": f"↻ {name}", "web_app": {"url": f"{base}/m/{handle}"}}
                ])
            extra = (
                "\n\n♻️ <b>Avvalgi ustalaringiz</b> — qayta bron qilish uchun pastdan tanlang."
                if recents else ""
            )
            self._call(token, "sendMessage", {
                "chat_id": chat_id,
                "text": WELCOME + extra,
                "parse_mode": "HTML",
                "reply_markup": {"inline_keyboard": rows},
            })

    def _save_contact(self, contact):
        """Attach a shared phone number to the matching Telegram user."""
        from apps.accounts.models import User

        tg_id = contact.get("user_id")
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
    def _handle_callback(self, token, callback):
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
            self._answer_callback(token, cq_id)
            self._send_master_bookings(token, chat_id, from_id)
            return

        # rate:<booking_id>:<stars>
        if action == "rate" and len(parts) == 3:
            self._handle_rate(token, cq_id, chat_id, message_id, from_id, parts[1], parts[2])
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
                token, cq_id, chat_id, message_id, from_id, parts[1], status_map[action]
            )
            return

        self._answer_callback(token, cq_id)

    def _handle_master_action(self, token, cq_id, chat_id, message_id, from_id, booking_id, new_status):
        from apps.bookings.models import Booking
        from apps.bookings.tg import booking_text, master_keyboard

        booking = (
            Booking.objects.filter(id=booking_id)
            .select_related("master__user", "client", "service")
            .first()
        )
        if not booking:
            self._answer_callback(token, cq_id, "Bron topilmadi", alert=True)
            return
        if booking.master.user.telegram_id != from_id:
            self._answer_callback(token, cq_id, "Ruxsat yo'q", alert=True)
            return
        # A booking can't be started before its scheduled time.
        if new_status == Booking.Status.IN_PROGRESS and timezone.now() < booking.start_at:
            self._answer_callback(
                token, cq_id, "Belgilangan vaqtidan oldin boshlab bo'lmaydi", alert=True
            )
            return
        booking.status = new_status
        # Saving fires the post_save signal which notifies the client (and, on
        # completion, sends them the rating buttons).
        booking.save(update_fields=["status", "updated_at"])
        self._edit_message(
            token, chat_id, message_id, booking_text(booking), master_keyboard(booking)
        )
        self._answer_callback(token, cq_id, "Bajarildi ✅")

    def _handle_rate(self, token, cq_id, chat_id, message_id, from_id, booking_id, stars):
        from apps.bookings.models import Booking
        from apps.masters.models import Review

        booking = (
            Booking.objects.filter(id=booking_id).select_related("master", "client").first()
        )
        if not booking:
            self._answer_callback(token, cq_id, "Bron topilmadi", alert=True)
            return
        if booking.client.telegram_id != from_id:
            self._answer_callback(token, cq_id, "Ruxsat yo'q", alert=True)
            return
        try:
            rating = max(1, min(5, int(stars)))
        except ValueError:
            self._answer_callback(token, cq_id)
            return
        Review.objects.update_or_create(
            master=booking.master, author=booking.client, defaults={"rating": rating}
        )
        booking.master.recompute_rating()
        self._edit_message(
            token, chat_id, message_id, f"🙏 Rahmat! Siz {rating}⭐ baho berdingiz.", None
        )
        self._answer_callback(token, cq_id, "Baholandi ✅")

    def _is_master(self, tg_id):
        """True if this Telegram user owns a master profile."""
        from apps.masters.models import MasterProfile

        return MasterProfile.objects.filter(user__telegram_id=tg_id).exists()

    def _send_master_bookings(self, token, chat_id, from_id):
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
            self._call(token, "sendMessage", {
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
            self._call(token, "sendMessage", {
                "chat_id": chat_id,
                "text": "📋 Hozircha faol bronlaringiz yo'q.",
            })
            return

        self._call(token, "sendMessage", {
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
            self._call(token, "sendMessage", payload)

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

    def _answer_callback(self, token, cq_id, text=None, alert=False):
        payload = {"callback_query_id": cq_id}
        if text:
            payload["text"] = text
            payload["show_alert"] = alert
        self._call(token, "answerCallbackQuery", payload)

    def _edit_message(self, token, chat_id, message_id, text, reply_markup):
        payload = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": "HTML",
        }
        # Omitting reply_markup removes the inline keyboard (terminal states).
        if reply_markup:
            payload["reply_markup"] = reply_markup
        self._call(token, "editMessageText", payload)

    def _call(self, token, method, payload, timeout=10):
        try:
            r = requests.post(API.format(token=token, method=method), json=payload, timeout=timeout)
            return r.json()
        except requests.RequestException:
            raise
