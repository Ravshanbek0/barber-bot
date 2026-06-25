"""Register (or remove) the Telegram webhook so the bot runs on the web service.

    python manage.py set_webhook            # register the webhook + menu/commands
    python manage.py set_webhook --delete   # remove it (revert to long polling)
    python manage.py set_webhook --url https://example.com   # override base URL

The webhook URL is ``<BACKEND_URL>/api/v1/auth/telegram/webhook/``. On Render,
BACKEND_URL is taken from RENDER_EXTERNAL_URL automatically. Set
TELEGRAM_WEBHOOK_SECRET so Telegram signs each request with a header the view
verifies.
"""
import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.telegram_dispatch import API, TelegramBot

WEBHOOK_PATH = "/api/v1/auth/telegram/webhook/"


class Command(BaseCommand):
    help = "Telegram webhook'ini ro'yxatdan o'tkazadi yoki o'chiradi"

    def add_arguments(self, parser):
        parser.add_argument("--delete", action="store_true", help="Webhook'ni o'chirish (polling'ga qaytish)")
        parser.add_argument("--url", help="Backend bazaviy URL (BACKEND_URL o'rniga)")

    def handle(self, *args, **opts):
        token = settings.TELEGRAM_BOT_TOKEN
        if not token:
            raise CommandError("TELEGRAM_BOT_TOKEN sozlanmagan.")

        if opts["delete"]:
            r = requests.post(
                API.format(token=token, method="deleteWebhook"),
                json={"drop_pending_updates": False}, timeout=10,
            )
            self.stdout.write(self.style.SUCCESS(f"deleteWebhook -> {r.json()}"))
            return

        base = (opts.get("url") or settings.BACKEND_URL or "").rstrip("/")
        if not base.startswith("https://"):
            raise CommandError(
                f"BACKEND_URL HTTPS bo'lishi kerak (hozir: {base!r}). "
                "--url bilan bering yoki BACKEND_URL/RENDER_EXTERNAL_URL sozlang."
            )

        hook = f"{base}{WEBHOOK_PATH}"
        payload = {"url": hook, "allowed_updates": ["message", "callback_query"]}
        if settings.TELEGRAM_WEBHOOK_SECRET:
            payload["secret_token"] = settings.TELEGRAM_WEBHOOK_SECRET
        else:
            self.stderr.write(self.style.WARNING(
                "TELEGRAM_WEBHOOK_SECRET sozlanmagan — webhook himoyalanmaydi. "
                "Tasodifiy maxfiy qiymat qo'shish tavsiya etiladi."
            ))

        r = requests.post(API.format(token=token, method="setWebhook"), json=payload, timeout=10)
        self.stdout.write(self.style.SUCCESS(f"setWebhook -> {hook}\n{r.json()}"))

        # Also (re)register the menu button + slash commands.
        TelegramBot(token).setup()
        self.stdout.write("Menu tugmasi va buyruqlar sozlandi.")
