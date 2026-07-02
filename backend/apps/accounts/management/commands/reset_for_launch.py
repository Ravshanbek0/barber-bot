"""One-time wipe of all user-generated data before a production launch.

Deletes every client/master account, booking, review, chat, discount, and
activity-log entry — restores the database to a "just migrated" state so real
users don't see leftover test data (test masters in search results, stale
bookings, etc). Staff/superuser accounts are kept by default so the admin
panel keeps working immediately after.

    python manage.py reset_for_launch --yes            # keeps staff accounts
    python manage.py reset_for_launch --yes --include-staff   # wipes everyone

Requires --yes (a plain confirmation prompt isn't enough for something this
destructive to run unattended in a shell). Irreversible — there is no undo.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Productionga chiqishdan oldin barcha user/usta/bron/chat ma'lumotlarini o'chiradi"

    def add_arguments(self, parser):
        parser.add_argument(
            "--yes", action="store_true",
            help="Majburiy — bu buyruq --yes siz hech narsa qilmaydi.",
        )
        parser.add_argument(
            "--include-staff", action="store_true",
            help="Staff/superuser hisoblarni ham o'chiradi (default: saqlanadi).",
        )

    def handle(self, *args, **options):
        if not options["yes"]:
            raise CommandError(
                "Bu buyruq QAYTARIB BO'LMAYDIGAN holda barcha ma'lumotlarni o'chiradi. "
                "Rostdan xohlasangiz --yes bilan qayta ishga tushiring."
            )

        from apps.accounts.models import OtpCode, User
        from apps.adminpanel.models import ActivityEvent
        from apps.bookings.models import Booking
        from apps.chat.models import Conversation, Message
        from apps.masters.models import Discount, MasterProfile, Review, SavedMaster, Service, WorkingHours

        counts = {}
        with transaction.atomic():
            counts["Message"] = Message.objects.all().delete()[0]
            counts["Conversation"] = Conversation.objects.all().delete()[0]
            counts["Booking"] = Booking.objects.all().delete()[0]
            counts["Review"] = Review.objects.all().delete()[0]
            counts["SavedMaster"] = SavedMaster.objects.all().delete()[0]
            counts["Discount"] = Discount.objects.all().delete()[0]
            counts["WorkingHours"] = WorkingHours.objects.all().delete()[0]
            counts["Service"] = Service.objects.all().delete()[0]
            counts["MasterProfile"] = MasterProfile.objects.all().delete()[0]
            counts["OtpCode"] = OtpCode.objects.all().delete()[0]
            counts["ActivityEvent"] = ActivityEvent.objects.all().delete()[0]

            users = User.objects.all()
            if not options["include_staff"]:
                users = users.exclude(is_staff=True).exclude(is_superuser=True)
            counts["User"] = users.delete()[0]

        for model, n in counts.items():
            self.stdout.write(f"  {model}: {n} ta o'chirildi")
        kept = User.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f"Tayyor. {kept} ta hisob saqlanib qoldi (staff/superuser)."
            if kept else "Tayyor. Baza to'liq bo'shatildi."
        ))
