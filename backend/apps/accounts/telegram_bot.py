"""Outbound Telegram Bot API helper — used for notifications and reminders.

Sends a message to a user by their Telegram chat id (== ``User.telegram_id``).
In dev (no bot token) the message is printed to the console so flows are testable
without a real bot.

NOTE: sends are synchronous. For production move these calls to a background
worker (Celery / RQ) so they don't block the request/response cycle.
"""
import logging
import sys

import requests
from django.conf import settings

log = logging.getLogger(__name__)

API = "https://api.telegram.org/bot{token}/sendMessage"


def _safe_print(text: str) -> None:
    """Print without crashing on consoles that can't encode emoji (e.g. Windows cp1251)."""
    enc = (sys.stdout.encoding or "utf-8")
    sys.stdout.write(text.encode(enc, "replace").decode(enc) + "\n")


def send_message(chat_id, text: str, reply_markup=None) -> bool:
    """Send a Telegram message. Returns True on success.

    ``reply_markup`` is an optional inline-keyboard dict (Telegram format) for
    action buttons such as booking confirmation or rating stars.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    if not token or not chat_id:
        if settings.OTP_DEV_PRINT:
            extra = " [tugmalar bilan]" if reply_markup else ""
            _safe_print(f"[DEV TG MSG] -> {chat_id}: {text}{extra}")
        return False
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        resp = requests.post(
            API.format(token=token),
            json=payload,
            timeout=5,
        )
        if not resp.ok:
            log.warning("Telegram sendMessage failed: %s", resp.text)
        return resp.ok
    except requests.RequestException as exc:
        log.warning("Telegram sendMessage error: %s", exc)
        return False
