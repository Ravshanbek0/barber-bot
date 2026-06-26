"""Owner-only admin API: stats + activity monitoring.

Auth: a staff (is_staff) account signs in with phone + password at
``/api/v1/admin/login/`` and gets a JWT. Every other endpoint requires
``IsAdminUser`` (== is_staff), so regular app users can never reach it.
"""
from datetime import timedelta

from django.db.models import Count, Max, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.bookings.models import Booking
from apps.masters.models import Discount, MasterProfile

from .models import ActivityEvent
from .serializers import ActivityEventSerializer, AdminUserSerializer


@api_view(["POST"])
@permission_classes([AllowAny])
def admin_login(request):
    """Phone + password sign-in, restricted to staff accounts."""
    phone = (request.data.get("phone") or "").strip()
    password = request.data.get("password") or ""
    user = User.objects.filter(phone=phone).first()
    if not user or not user.check_password(password) or not user.is_staff:
        return Response(
            {"detail": "Login yoki parol noto'g'ri, yoki ruxsat yo'q."}, status=400
        )
    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {"id": user.id, "name": user.display_name, "phone": user.phone},
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def overview(request):
    """Headline counters for the dashboard cards."""
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    status_counts = dict(
        Booking.objects.values_list("status").annotate(n=Count("id"))
    )

    events_today = ActivityEvent.objects.filter(created_at__gte=today)
    by_kind_today = dict(events_today.values_list("kind").annotate(n=Count("id")))

    return Response(
        {
            "users_total": User.objects.count(),
            "users_registered": User.objects.filter(is_registered=True).count(),
            "masters_total": MasterProfile.objects.count(),
            "masters_published": MasterProfile.objects.filter(is_active=True).count(),
            "bookings_total": Booking.objects.count(),
            "bookings_by_status": status_counts,
            "active_discounts": sum(
                1 for d in Discount.objects.all() if d.is_live
            ),
            "today": {
                "new_users": User.objects.filter(created_at__gte=today).count(),
                "logins": by_kind_today.get("login", 0),
                "bot_starts": by_kind_today.get("bot_start", 0),
                "bookings": by_kind_today.get("booking_created", 0),
                "events": events_today.count(),
            },
            "generated_at": now,
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminUser])
def users(request):
    """Every user with activity rollups (last seen, event/booking counts)."""
    qs = (
        User.objects.annotate(
            events_count=Count("activity_events", distinct=True),
            last_seen=Max("activity_events__created_at"),
            bookings_count=Count("bookings", distinct=True),
        )
        .order_by("-created_at")
    )
    role = request.query_params.get("role")
    if role == "master":
        qs = qs.filter(is_master=True)
    elif role == "client":
        qs = qs.filter(is_master=False)
    return Response(AdminUserSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def masters(request):
    """Master profiles with booking / service / review rollups."""
    qs = (
        MasterProfile.objects.select_related("user")
        .annotate(
            bookings_count=Count("bookings", distinct=True),
            services_active=Count(
                "services", filter=Q(services__is_active=True), distinct=True
            ),
        )
        .order_by("-created_at")
    )
    data = [
        {
            "id": m.id,
            "handle": m.handle,
            "display_name": m.display_name,
            "city": m.city,
            "is_active": m.is_active,
            "accepts_walkins": m.accepts_walkins,
            "avg_rating": float(m.avg_rating),
            "reviews_count": m.reviews_count,
            "services_active": m.services_active,
            "bookings_count": m.bookings_count,
            "telegram_id": m.user.telegram_id,
            "created_at": m.created_at,
        }
        for m in qs
    ]
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAdminUser])
def bookings(request):
    """Most recent bookings across the whole platform."""
    qs = (
        Booking.objects.select_related("master", "client")
        .prefetch_related("services")
        .order_by("-created_at")[:100]
    )
    data = [
        {
            "id": b.id,
            "client": b.client_label(),
            "is_walk_in": b.is_walk_in,
            "master": b.master.display_name,
            "master_handle": b.master.handle,
            "services": b.services_label(),
            "status": b.status,
            "status_label": b.get_status_display(),
            "price": float(b.price_snapshot) if b.price_snapshot is not None else None,
            "start_at": b.start_at,
            "created_at": b.created_at,
        }
        for b in qs
    ]
    return Response(data)


class ActivityList(ListAPIView):
    """Paginated activity feed (newest first), optional ?kind= filter."""

    permission_classes = [IsAdminUser]
    serializer_class = ActivityEventSerializer

    def get_queryset(self):
        qs = ActivityEvent.objects.all()
        kind = self.request.query_params.get("kind")
        if kind:
            qs = qs.filter(kind=kind)
        since = self.request.query_params.get("since")
        if since:
            qs = qs.filter(created_at__gt=since)
        return qs
