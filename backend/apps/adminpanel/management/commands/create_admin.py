"""Create or update the admin-panel login (a staff account).

Usage (local or on Render via the shell):

    python manage.py create_admin --phone +998901234567 --password "Strong#Pass"

Or set ADMIN_PHONE / ADMIN_PASSWORD env vars and run with no args. Idempotent:
re-running updates the password and (re)grants staff/superuser, so it doubles as
a password reset.
"""
import os

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Create/update the staff account used to log into the admin panel."

    def add_arguments(self, parser):
        parser.add_argument("--phone", default=os.getenv("ADMIN_PHONE"))
        parser.add_argument("--password", default=os.getenv("ADMIN_PASSWORD"))
        parser.add_argument("--name", default=os.getenv("ADMIN_NAME", "Admin"))

    def handle(self, *args, **opts):
        phone = (opts.get("phone") or "").strip()
        password = opts.get("password") or ""
        if not phone or not password:
            raise CommandError(
                "Provide --phone and --password (or ADMIN_PHONE / ADMIN_PASSWORD env)."
            )

        user, created = User.objects.get_or_create(
            phone=phone, defaults={"first_name": opts["name"]}
        )
        user.is_staff = True
        user.is_superuser = True
        user.is_registered = True
        user.is_phone_verified = True
        user.set_password(password)
        user.save()

        verb = "created" if created else "updated"
        self.stdout.write(
            self.style.SUCCESS(f"Admin {verb}: {phone} (staff + superuser).")
        )
