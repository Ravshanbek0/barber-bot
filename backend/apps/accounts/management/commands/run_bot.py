"""Run the Telegram bot via long polling (handy for local development).

    python manage.py run_bot

Requires in backend/.env:
    TELEGRAM_BOT_TOKEN=...        # from @BotFather
    WEBAPP_URL=https://...        # public HTTPS URL of the frontend (Mini App)

The update-handling logic lives in ``apps.accounts.telegram_dispatch`` so it is
shared with the production webhook view. For production prefer the webhook
(``python manage.py set_webhook``): it needs no always-on process. Polling and
webhook are mutually exclusive — delete the webhook before polling.

For local testing expose the frontend over HTTPS (ngrok / cloudflared) and set
WEBAPP_URL to that tunnel URL. web_app buttons require HTTPS.
"""
import time

import requests
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.telegram_dispatch import TelegramBot


class Command(BaseCommand):
    help = "Telegram botni long-polling orqali ishga tushiradi (lokal dev)"

    def handle(self, *args, **options):
        bot = TelegramBot()
        if not bot.token:
            raise CommandError("TELEGRAM_BOT_TOKEN .env da sozlanmagan.")
        if not bot.url.startswith("https://"):
            self.stderr.write(
                self.style.WARNING(
                    f"WEBAPP_URL HTTPS bo'lishi kerak (hozir: {bot.url}). "
                    "web_app tugmasi faqat HTTPS bilan ishlaydi."
                )
            )

        bot.setup()
        self.stdout.write(
            self.style.SUCCESS(f"Bot @{bot.get_username()} ishlamoqda. To'xtatish: Ctrl+C")
        )

        offset = None
        while True:
            try:
                resp = bot.call("getUpdates", {"timeout": 30, "offset": offset}, timeout=35)
                for upd in (resp or {}).get("result", []):
                    offset = upd["update_id"] + 1
                    bot.handle_update(upd)
            except requests.RequestException as exc:
                self.stderr.write(f"Tarmoq xatosi: {exc}")
                time.sleep(3)
            except KeyboardInterrupt:
                self.stdout.write("\nTo'xtatildi.")
                break
