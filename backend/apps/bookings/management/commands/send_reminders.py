"""Send booking reminders to clients shortly before their appointment.

Run on a schedule (cron every few minutes, or Windows Task Scheduler):

    python manage.py send_reminders            # default: next 60 minutes
    python manage.py send_reminders --minutes 30

Idempotent: each booking is reminded once (``reminder_sent`` flag).
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.telegram_bot import send_message
from apps.bookings.models import Booking


class Command(BaseCommand):
    help = "Mijozlarga yaqinlashayotgan bronlar haqida eslatma yuboradi"

    def add_arguments(self, parser):
        parser.add_argument(
            "--minutes",
            type=int,
            default=60,
            help="Necha daqiqa oldin eslatma yuborilsin (default 60)",
        )

    def handle(self, *args, **options):
        minutes = options["minutes"]
        now = timezone.now()
        window_end = now + timedelta(minutes=minutes)

        due = Booking.objects.select_related("master", "service", "client").filter(
            start_at__gte=now,
            start_at__lte=window_end,
            reminder_sent=False,
            status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED],
        )

        sent = 0
        for booking in due:
            when = timezone.localtime(booking.start_at).strftime("%d.%m %H:%M")
            service = booking.services_label()
            send_message(
                getattr(booking.client, "telegram_id", None),
                f"⏰ <b>Eslatma</b>\n{booking.master.display_name} · {service}\n"
                f"🗓 {when} da broningiz bor.",
            )
            # .update() avoids re-triggering the post_save Telegram notifications.
            Booking.objects.filter(pk=booking.pk).update(reminder_sent=True)
            sent += 1

        self.stdout.write(self.style.SUCCESS(f"{sent} ta eslatma yuborildi."))
