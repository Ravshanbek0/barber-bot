"""Ask clients to confirm an upcoming visit 15 minutes before it starts.

Run on a schedule (cron every minute, or Windows Task Scheduler):

    python manage.py send_confirmations

Each booking is asked at most once (``confirm_stage``: 0 → 1 at the 15-min
mark). The client taps "✅ Kelaman" which the bot records
(``client_confirmed``) by editing this same card in place (see
``TelegramBot._handle_visit_ok``).

Replaces the client's existing status card (delete + resend, same as any
other status change — see ``signals.py``) so there's still only one message
per booking, instead of a second standalone "please confirm" message.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.telegram_bot import delete_message, send_message
from apps.bookings.models import Booking
from apps.bookings.tg import confirm_request_text, confirm_visit_keyboard

MINUTES_BEFORE = 15


class Command(BaseCommand):
    help = "Navbatga 15 daqiqa qolganda mijozdan tasdiqlash so'raydi"

    def handle(self, *args, **options):
        now = timezone.now()
        due = Booking.objects.select_related("master", "client").filter(
            status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED],
            client__isnull=False,
            client_confirmed=False,
            confirm_stage=0,
            start_at__gt=now,
            start_at__lte=now + timedelta(minutes=MINUTES_BEFORE),
        )

        sent = 0
        for b in due:
            tg_id = getattr(b.client, "telegram_id", None)
            fields = {"confirm_stage": 1}
            if tg_id:
                if b.client_message_id:
                    delete_message(tg_id, b.client_message_id)
                new_msg = send_message(
                    tg_id,
                    confirm_request_text(b, MINUTES_BEFORE),
                    reply_markup=confirm_visit_keyboard(b),
                )
                if new_msg:
                    fields["client_message_id"] = new_msg
            # update() avoids re-firing the booking post_save notifications.
            Booking.objects.filter(pk=b.pk).update(**fields)
            sent += 1

        self.stdout.write(self.style.SUCCESS(f"{sent} ta tasdiqlash so'rovi yuborildi."))
