"""Ask clients to confirm an upcoming visit 15 then 5 minutes before it starts.

Run on a schedule (cron every minute, or Windows Task Scheduler):

    python manage.py send_confirmations

Each booking is asked at most once per stage (``confirm_stage``: 0 → 1 at the
15-min mark, → 2 at the 5-min mark). The client taps "✅ Kelaman" which the bot
records (``client_confirmed``). Auto-reject on no answer is intentionally not
done here yet.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.telegram_bot import send_message
from apps.bookings.models import Booking
from apps.bookings.tg import confirm_request_text, confirm_visit_keyboard


class Command(BaseCommand):
    help = "Navbatga 15/5 daqiqa qolganda mijozdan tasdiqlash so'raydi"

    def handle(self, *args, **options):
        now = timezone.now()
        base = Booking.objects.select_related("master", "client").filter(
            status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED],
            client__isnull=False,
            client_confirmed=False,
        )

        sent = 0
        # 5-min stage first (more urgent) so a booking already inside 5 minutes
        # gets the 5-min ask and skips the 15-min one.
        stages = [
            (2, now, now + timedelta(minutes=5), 5),
            (1, now + timedelta(minutes=5), now + timedelta(minutes=15), 15),
        ]
        for target_stage, lo, hi, minutes in stages:
            due = base.filter(
                confirm_stage__lt=target_stage, start_at__gt=lo, start_at__lte=hi
            )
            for b in due:
                tg_id = getattr(b.client, "telegram_id", None)
                if tg_id:
                    send_message(
                        tg_id,
                        confirm_request_text(b, minutes),
                        reply_markup=confirm_visit_keyboard(b),
                    )
                # update() avoids re-firing the booking post_save notifications.
                Booking.objects.filter(pk=b.pk).update(confirm_stage=target_stage)
                sent += 1

        self.stdout.write(self.style.SUCCESS(f"{sent} ta tasdiqlash so'rovi yuborildi."))
