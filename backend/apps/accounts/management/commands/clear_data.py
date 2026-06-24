"""Wipe demo/test content for a clean real start.

    python manage.py clear_data            # masters, bookings, chat, reviews...
    python manage.py clear_data --users    # also delete all non-superuser users

Schema is kept; superusers are never deleted.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.accounts.models import OtpCode
from apps.bookings.models import Booking
from apps.chat.models import Conversation, Message
from apps.masters.models import (
    Discount,
    MasterProfile,
    PortfolioItem,
    Review,
    Service,
    WorkingHours,
)


class Command(BaseCommand):
    help = "Demo/test ma'lumotlarni o'chiradi (toza start uchun)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--users",
            action="store_true",
            help="Superuser bo'lmagan barcha foydalanuvchilarni ham o'chirish",
        )

    def handle(self, *args, **options):
        # Order: leaf rows first (most cascade anyway, but explicit is clear).
        for model in (
            Message,
            Conversation,
            Booking,
            Review,
            PortfolioItem,
            Discount,
            WorkingHours,
            Service,
            MasterProfile,
            OtpCode,
        ):
            count, _ = model.objects.all().delete()
            self.stdout.write(f"  {model.__name__}: {count} o'chirildi")

        if options["users"]:
            User = get_user_model()
            count, _ = User.objects.filter(is_superuser=False).delete()
            self.stdout.write(f"  User (non-superuser): {count} o'chirildi")

        self.stdout.write(self.style.SUCCESS("Tozalandi. Toza start tayyor."))
