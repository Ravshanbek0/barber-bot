"""Ask clients to confirm an upcoming visit 15 minutes before it starts.

Run on a schedule (cron every minute, or Windows Task Scheduler):

    python manage.py send_confirmations

Each booking is asked at most once (``confirm_stage``: 0 → 1 at the 15-min
mark). The client taps "✅ Kelaman" which the bot records
(``client_confirmed``). Auto-reject on no answer is intentionally not done
here yet.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.telegram_bot import send_message
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
            if tg_id:
                send_message(
                    tg_id,
                    confirm_request_text(b, MINUTES_BEFORE),
                    reply_markup=confirm_visit_keyboard(b),
                )
            # update() avoids re-firing the booking post_save notifications.
            Booking.objects.filter(pk=b.pk).update(confirm_stage=1)
            sent += 1

        self.stdout.write(self.style.SUCCESS(f"{sent} ta tasdiqlash so'rovi yuborildi."))
