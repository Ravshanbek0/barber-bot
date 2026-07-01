"""Ask clients to confirm an upcoming visit 15, then again at 10, minutes
before it starts, if they haven't answered yet.

Run on a schedule (cron every minute, or Windows Task Scheduler):

    python manage.py send_confirmations

``confirm_stage`` tracks how far this has gone: 0 → 1 at the 15-min mark →
2 at the 10-min mark (only if still unconfirmed). The client taps "✅ Kelaman"
which the bot records (``client_confirmed``) by editing this same card in
place (see ``TelegramBot._handle_visit_ok``). If they never answer,
``auto_reject_unconfirmed`` cancels the booking once the start time arrives.

Each ask replaces the client's existing status card (delete + resend, same
as any other status change — see ``signals.py``) so there's still only one
message per booking, instead of extra standalone "please confirm" messages.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.telegram_bot import delete_message, send_message
from apps.bookings.models import Booking
from apps.bookings.tg import confirm_request_text, confirm_visit_keyboard

# (stage to reach, minutes-before-start wording, "still due" window in minutes).
# Processed most-urgent-first: a booking that's already inside 10 minutes gets
# asked directly (skipping straight to stage 2) instead of waiting for a
# 15-min pass that has already gone by.
STAGES = [
    (2, 10, 10),
    (1, 15, 15),
]


class Command(BaseCommand):
    help = "Navbatga 15, tasdiqlanmasa 10 daqiqa qolganda mijozdan tasdiqlash so'raydi"

    def handle(self, *args, **options):
        now = timezone.now()
        base = Booking.objects.select_related("master", "client").filter(
            status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED],
            client__isnull=False,
            client_confirmed=False,
        )

        sent = 0
        for target_stage, wording_minutes, window_minutes in STAGES:
            due = base.filter(
                confirm_stage__lt=target_stage,
                start_at__gt=now,
                start_at__lte=now + timedelta(minutes=window_minutes),
            )
            for b in due:
                tg_id = getattr(b.client, "telegram_id", None)
                fields = {"confirm_stage": target_stage}
                if tg_id:
                    if b.client_message_id:
                        delete_message(tg_id, b.client_message_id)
                    new_msg = send_message(
                        tg_id,
                        confirm_request_text(b, wording_minutes),
                        reply_markup=confirm_visit_keyboard(b),
                    )
                    if new_msg:
                        fields["client_message_id"] = new_msg
                # update() avoids re-firing the booking post_save notifications.
                Booking.objects.filter(pk=b.pk).update(**fields)
                sent += 1

        self.stdout.write(self.style.SUCCESS(f"{sent} ta tasdiqlash so'rovi yuborildi."))
