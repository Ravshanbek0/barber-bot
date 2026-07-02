import hashlib
import hmac
import logging

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import (
    OtpRequestSerializer,
    OtpVerifySerializer,
    TelegramAuthSerializer,
    UserSerializer,
)
from .services import create_and_send_otp, parse_telegram_init_data, verify_otp
from .telegram_dispatch import TelegramBot
from apps.adminpanel.events import record

log = logging.getLogger(__name__)


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _record_login_throttled(user, created):
    """Logs a login/joined activity event, but at most once per 10 minutes per
    user. AuthBootstrap re-verifies identity on every app open (including tab
    switches, reopens, etc — see the frontend), so without this the admin
    panel's activity feed fills up with the same "X ilovaga kirdi" line
    repeated every few minutes instead of showing real activity."""
    from datetime import timedelta

    from django.utils import timezone

    from apps.adminpanel.models import ActivityEvent

    if not created:
        recent = ActivityEvent.objects.filter(
            actor=user, kind__in=["login", "joined"],
            created_at__gte=timezone.now() - timedelta(minutes=10),
        ).exists()
        if recent:
            return
    record(user, kind="joined" if created else "login",
           description="Telegram orqali ilovaga kirdi")


def auth_response(user):
    return Response(
        {"user": UserSerializer(user).data, "tokens": tokens_for(user)},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def otp_request(request):
    """Step 1 of register-on-action: send a one-time code."""
    serializer = OtpRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    phone = serializer.validated_data["phone"]
    channel = serializer.validated_data.get("channel", "sms")
    create_and_send_otp(phone, channel)
    return Response({"detail": "OTP yuborildi", "phone": phone})


@api_view(["POST"])
@permission_classes([AllowAny])
def otp_verify(request):
    """Step 2: verify code, create the account lazily if needed, return tokens."""
    serializer = OtpVerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    phone = data["phone"]

    if not verify_otp(phone, data["code"]):
        return Response(
            {"detail": "Kod noto'g'ri yoki muddati o'tgan"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user, created = User.objects.get_or_create(phone=phone)
    changed = False
    if not user.is_phone_verified:
        user.is_phone_verified = True
        user.is_registered = True
        changed = True
    if data.get("first_name") and not user.first_name:
        user.first_name = data["first_name"]
        changed = True
    if data.get("last_name") and not user.last_name:
        user.last_name = data["last_name"]
        changed = True
    if data.get("as_master") and not user.is_master:
        user.is_master = True
        user.role = User.Role.MASTER
        changed = True
    if changed:
        user.save()

    return auth_response(user)


@api_view(["POST"])
@permission_classes([AllowAny])
def telegram_webapp(request):
    """Primary auth: validate Telegram Mini App ``initData`` and sign the user in.

    The frontend sends ``Telegram.WebApp.initData``. We verify the signature,
    then silently create/update the account keyed on Telegram id and return JWT.
    """
    init_data = request.data.get("init_data", "")
    tg_user = parse_telegram_init_data(init_data)
    if not tg_user:
        return Response(
            {"detail": "Telegram ma'lumoti yaroqsiz"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tg_id = tg_user.get("id")
    if not tg_id:
        return Response(
            {"detail": "Telegram foydalanuvchisi aniqlanmadi"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # New Telegram users start as guests (is_registered=False): they can browse,
    # but must add a phone to book. The Telegram identity is trusted for login.
    user, created = User.objects.get_or_create(
        telegram_id=tg_id,
        defaults={"phone": f"tg{tg_id}"},
    )
    # Keep profile fresh from Telegram on every launch.
    fields = []
    for src, dst in (("first_name", "first_name"), ("last_name", "last_name")):
        val = tg_user.get(src, "") or ""
        if val and getattr(user, dst) != val:
            setattr(user, dst, val)
            fields.append(dst)
    if tg_user.get("username") and user.telegram_username != tg_user["username"]:
        user.telegram_username = tg_user["username"]
        fields.append("telegram_username")
    if tg_user.get("photo_url") and user.photo_url != tg_user["photo_url"]:
        user.photo_url = tg_user["photo_url"]
        fields.append("photo_url")
    if fields:
        user.save(update_fields=fields)

    _record_login_throttled(user, created)
    return auth_response(user)


@api_view(["POST"])
@permission_classes([AllowAny])
def dev_login(request):
    """Fallback guest login for whenever Telegram initData isn't available —
    local dev in a plain browser, but also production if the Mini App is ever
    opened outside Telegram (or Telegram fails to hand over initData, as some
    Desktop versions do). Deliberately not DEBUG-gated: the product is only
    distributed via the Telegram bot, so this only catches edge cases, and
    signing those in as a shared guest beats showing a dead-end error screen.

    Mirrors the Telegram flow: you start as a guest and register later
    (phone to book, or "Usta bo'lish" to become a master).
    """
    user, created = User.objects.get_or_create(
        phone="+998900000002",
        defaults={"first_name": "Mehmon"},
    )
    _record_login_throttled(user, created)
    return auth_response(user)


def _attach_phone(user, phone):
    """Save a verified phone to the user and mark them a registered (real) user."""
    if not User.objects.exclude(pk=user.pk).filter(phone=phone).exists():
        user.phone = phone
    user.is_phone_verified = True
    user.is_registered = True
    user.save(update_fields=["phone", "is_phone_verified", "is_registered"])
    record(user, kind="registered", description="Telefon raqamini tasdiqladi")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_phone(request):
    """Directly save a phone (used by the Telegram contact-share path)."""
    phone = (request.data.get("phone") or "").strip()
    if len("".join(ch for ch in phone if ch.isdigit())) < 9:
        return Response({"detail": "Telefon raqamini to'g'ri kiriting"}, status=400)
    _attach_phone(request.user, phone)
    return auth_response(request.user)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def phone_otp_request(request):
    """Send an OTP to verify the phone of the currently logged-in user.

    Demo mode (no SMS provider): the code is returned in the response so it can
    be shown in the app.
    """
    phone = (request.data.get("phone") or "").strip()
    if len("".join(ch for ch in phone if ch.isdigit())) < 9:
        return Response({"detail": "Telefon raqamini to'g'ri kiriting"}, status=400)
    otp = create_and_send_otp(phone, "sms")
    resp = {"detail": "Kod yuborildi", "phone": phone}
    if settings.OTP_DEV_PRINT or not settings.SMS_PROVIDER:
        resp["demo_code"] = otp.code  # demo: reveal the code in-app
    return Response(resp)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def phone_otp_verify(request):
    """Verify the OTP and attach the phone to the current user."""
    phone = (request.data.get("phone") or "").strip()
    code = (request.data.get("code") or "").strip()
    if not verify_otp(phone, code):
        return Response({"detail": "Kod noto'g'ri yoki muddati o'tgan"}, status=400)
    _attach_phone(request.user, phone)
    return auth_response(request.user)


class TelegramAuthView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TelegramAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if settings.TELEGRAM_BOT_TOKEN and not self._verify_hash(dict(data)):
            return Response(
                {"detail": "Telegram imzosi noto'g'ri"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tg_id = data["id"]
        user, _ = User.objects.get_or_create(
            telegram_id=tg_id,
            defaults={
                "phone": f"tg{tg_id}",
                "first_name": data.get("first_name", ""),
                "last_name": data.get("last_name", ""),
                "is_phone_verified": True,
            },
        )
        return auth_response(user)

    @staticmethod
    def _verify_hash(data):
        received_hash = data.pop("hash", None)
        check = "\n".join(f"{k}={data[k]}" for k in sorted(data) if data[k] != "")
        secret = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest()
        calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(calc, received_hash or "")


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@api_view(["POST"])
@permission_classes([AllowAny])
def telegram_webhook(request):
    """Telegram pushes bot updates here (production runs the bot via webhook).

    Verifies the secret-token header, then hands the update to the shared
    dispatcher. Always returns 200 so a handler error doesn't make Telegram
    retry the same update indefinitely.
    """
    secret = settings.TELEGRAM_WEBHOOK_SECRET
    if secret and request.headers.get("X-Telegram-Bot-Api-Secret-Token") != secret:
        return Response(status=status.HTTP_403_FORBIDDEN)
    try:
        TelegramBot().handle_update(request.data or {})
    except Exception:
        log.exception("Telegram webhook handler failed")
    return Response({"ok": True})
