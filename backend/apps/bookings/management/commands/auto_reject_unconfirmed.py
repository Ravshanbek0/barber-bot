"""Auto-cancel a booking if the client never confirmed the pre-visit ask
(15-min, then a 10-min follow-up — see ``send_confirmations``).

Run on a schedule (same cron as ``send_confirmations``/``send_reminders``):

    python manage.py auto_reject_unconfirmed

Only applies to bookings that reached at least one confirmation ask
(``confirm_stage`` >= 1 — 15-min sent, or 15-then-10-min both sent) and are
still unconfirmed once their start time arrives. Uses ``.update()`` + manual
Telegram calls (not ``booking.save()``) so the generic status-change
notification in ``signals.py`` doesn't also fire — this needs its own wording
explaining *why* it was cancelled.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.telegram_bot import delete_message, edit_message_text, send_message
from apps.bookings.models import Booking
from apps.bookings.tg import when_str


class Command(BaseCommand):
    help = "Tasdiqlamagan mijozning bronini belgilangan vaqt kelganda avtomatik bekor qiladi"

    def handle(self, *args, **options):
        now = timezone.now()
        due = Booking.objects.select_related("master__user", "client").filter(
            status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED],
            client__isnull=False,
            confirm_stage__gte=1,
            client_confirmed=False,
            start_at__lte=now,
        )

        count = 0
        for b in due:
            Booking.objects.filter(pk=b.pk).update(status=Booking.Status.CANCELLED)

            client_tg = getattr(b.client, "telegram_id", None)
            client_text = (
                "❌ <b>Broningiz bekor qilindi</b>\n"
                f"{b.master.display_name} · {b.services_label()}\n"
                f"🗓 {when_str(b)}\n"
                "Sabab: kelishingizni tasdiqlamaganingiz uchun."
            )
            if client_tg:
                if b.client_message_id:
                    delete_message(client_tg, b.client_message_id)
                new_msg = send_message(client_tg, client_text)
                if new_msg:
                    Booking.objects.filter(pk=b.pk).update(client_message_id=new_msg)

            master_tg = getattr(b.master.user, "telegram_id", None)
            if master_tg and b.master_message_id:
                master_text = (
                    "❌ <b>Bron bekor qilindi</b>\n"
                    f"{b.client_label()} · {b.services_label()}\n"
                    f"🗓 {when_str(b)}\n"
                    "Sabab: mijoz kelishini tasdiqlamadi."
                )
                edit_message_text(master_tg, b.master_message_id, master_text, reply_markup=None)

            count += 1

        self.stdout.write(self.style.SUCCESS(f"{count} ta bron tasdiqlanmagani uchun bekor qilindi."))
