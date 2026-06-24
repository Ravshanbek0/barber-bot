"""OTP generation / verification and message delivery, plus Telegram WebApp auth."""
import hashlib
import hmac
import json
import random
from datetime import timedelta
from urllib.parse import parse_qsl

from django.conf import settings
from django.utils import timezone

from .models import OtpCode


def _generate_code():
    return f"{random.randint(0, 999999):06d}"


def send_sms(phone: str, text: str) -> None:
    """Deliver an SMS. In dev (no provider configured) print to console.

    Plug a real provider (Eskiz, Play Mobile, Twilio, ...) here.
    """
    if not settings.SMS_PROVIDER or settings.OTP_DEV_PRINT:
        print(f"[DEV SMS] -> {phone}: {text}")
        return
    # Example integration point:
    # requests.post(provider_url, json={...}, headers={"Authorization": settings.SMS_API_KEY})
    raise NotImplementedError("Configure your SMS provider in services.send_sms")


def send_telegram(phone: str, text: str) -> None:
    """Deliver a code via Telegram bot. Dev fallback prints to console."""
    if not settings.TELEGRAM_BOT_TOKEN or settings.OTP_DEV_PRINT:
        print(f"[DEV TELEGRAM] -> {phone}: {text}")
        return
    raise NotImplementedError("Configure your Telegram bot in services.send_telegram")


def create_and_send_otp(phone: str, channel: str = OtpCode.Channel.SMS) -> OtpCode:
    # invalidate previous unused codes
    OtpCode.objects.filter(phone=phone, is_used=False).update(is_used=True)
    code = _generate_code()
    otp = OtpCode.objects.create(
        phone=phone,
        code=code,
        channel=channel,
        expires_at=timezone.now() + timedelta(seconds=settings.OTP_TTL_SECONDS),
    )
    text = f"Barber: tasdiqlash kodingiz {code}. {settings.OTP_TTL_SECONDS // 60} daqiqa amal qiladi."
    if channel == OtpCode.Channel.TELEGRAM:
        send_telegram(phone, text)
    else:
        send_sms(phone, text)
    return otp


def verify_otp(phone: str, code: str) -> bool:
    otp = (
        OtpCode.objects.filter(phone=phone, is_used=False)
        .order_by("-created_at")
        .first()
    )
    if not otp or otp.is_expired:
        return False
    otp.attempts += 1
    if otp.attempts > 5:
        otp.is_used = True
        otp.save(update_fields=["attempts", "is_used"])
        return False
    if otp.code != code:
        otp.save(update_fields=["attempts"])
        return False
    otp.is_used = True
    otp.save(update_fields=["attempts", "is_used"])
    return True


def parse_telegram_init_data(init_data: str) -> dict | None:
    """Validate Telegram Mini App ``initData`` and return the parsed ``user`` dict.

    Algorithm (Telegram WebApp spec):
        secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
        check_hash = HMAC_SHA256(key=secret_key, msg=data_check_string)
    where ``data_check_string`` is the "key=value" pairs (excluding ``hash``),
    sorted by key and joined with newlines.

    In dev (no bot token configured) we skip the signature check and just parse,
    so the app is testable in a normal browser. Returns ``None`` if invalid.
    """
    if not init_data:
        return None
    try:
        parsed = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError:
        return None

    received_hash = parsed.pop("hash", None)
    token = settings.TELEGRAM_BOT_TOKEN

    if token:
        if not received_hash:
            return None
        check_string = "\n".join(f"{k}={parsed[k]}" for k in sorted(parsed))
        secret_key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
        calc = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(calc, received_hash):
            return None

    user_raw = parsed.get("user")
    if not user_raw:
        return None
    try:
        return json.loads(user_raw)
    except json.JSONDecodeError:
        return None
