from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.masters.models import MasterProfile, Service

from .models import Booking
from .serializers import BookingSerializer

# Default slot length (minutes) when a booking has no service attached.
DEFAULT_SLOT_MIN = 30


def _booking_end(start_at, service):
    minutes = service.duration_min if service else DEFAULT_SLOT_MIN
    return start_at + timedelta(minutes=minutes)


def _validate_within_working_hours(master, start_at, total_min):
    """Reject a booking that falls on a day off or outside the master's hours.

    Mirrors the frontend slot rules: weekday 0=Mon..6=Sun; a close time <= open
    means the shift runs past midnight.
    """
    local_start = timezone.localtime(start_at)
    wh = master.working_hours.filter(weekday=local_start.weekday()).first()
    if not wh or wh.is_day_off:
        raise ValidationError({"detail": "Bu kuni usta ishlamaydi."})
    open_min = wh.start_time.hour * 60 + wh.start_time.minute
    close_min = wh.end_time.hour * 60 + wh.end_time.minute
    if close_min <= open_min:
        close_min += 24 * 60
    start_min = local_start.hour * 60 + local_start.minute
    if start_min < open_min or start_min + total_min > close_min:
        raise ValidationError({"detail": "Tanlangan vaqt usta ish vaqtidan tashqarida."})


def _active_bookings_for_day(master, day_start):
    day_end = day_start + timedelta(days=1)
    return Booking.objects.filter(
        master=master, start_at__gte=day_start, start_at__lt=day_end
    ).exclude(status__in=[Booking.Status.CANCELLED, Booking.Status.NO_SHOW])


class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "master"]
    ordering_fields = ["start_at", "queue_position", "created_at"]

    def get_queryset(self):
        user = self.request.user
        qs = Booking.objects.select_related("client", "master", "service").prefetch_related("services")
        # Clients see their own bookings; masters see bookings for their profile.
        # Newest first so fresh bookings surface at the top of the list.
        return qs.filter(Q(client=user) | Q(master__user=user)).distinct().order_by("-created_at")

    def perform_create(self, serializer):
        master = serializer.validated_data["master"]
        # The visit may bundle several services — its length and price are their
        # combined totals (falls back to the single `service` for legacy input).
        services = serializer.validated_data.get("services") or []
        if not services and serializer.validated_data.get("service"):
            services = [serializer.validated_data["service"]]
        start_at = serializer.validated_data["start_at"]
        total_min = sum(s.duration_min for s in services) or DEFAULT_SLOT_MIN
        end_at = start_at + timedelta(minutes=total_min)
        price = sum((s.price for s in services), Decimal("0")) if services else None

        # Reject bookings in the past (allow a 1-min grace for clock skew).
        if start_at < timezone.now() - timedelta(minutes=1):
            raise ValidationError({"detail": "O'tgan vaqtga bron qilib bo'lmaydi."})

        # Reject bookings outside the master's working hours / on a day off.
        _validate_within_working_hours(master, start_at, total_min)

        # Reject overlapping slots — a taken time can't be double-booked.
        # Any active booking that starts before the new one ends is a candidate;
        # it clashes if it also ends after the new one starts. (Day-independent
        # so it stays correct across midnight / timezones.)
        candidates = (
            Booking.objects.filter(master=master, start_at__lt=end_at)
            .exclude(status__in=[Booking.Status.CANCELLED, Booking.Status.NO_SHOW])
        )
        for b in candidates:
            b_end = b.end_at or _booking_end(b.start_at, b.service)
            if b_end > start_at:
                raise ValidationError({"detail": "Bu vaqt allaqachon band qilingan."})

        day_start = start_at.replace(hour=0, minute=0, second=0, microsecond=0)
        active_count = _active_bookings_for_day(master, day_start).count()
        serializer.save(
            client=self.request.user,
            end_at=end_at,
            price_snapshot=price,
            queue_position=active_count + 1,
        )

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def taken(self, request):
        """Busy intervals for a master on a given day, so clients can't pick a
        taken slot. Returns only times (no client details)."""
        master = MasterProfile.objects.filter(id=request.query_params.get("master")).first()
        if not master:
            return Response({"detail": "Master topilmadi"}, status=404)
        date_str = request.query_params.get("date")
        try:
            day = datetime.strptime(date_str, "%Y-%m-%d")
            day_start = timezone.make_aware(day) if timezone.is_naive(day) else day
        except (TypeError, ValueError):
            return Response({"detail": "date=YYYY-MM-DD kerak"}, status=400)
        day_start = day_start.replace(hour=0, minute=0, second=0, microsecond=0)
        busy = [
            {
                "start_at": b.start_at.isoformat(),
                "end_at": (b.end_at or _booking_end(b.start_at, b.service)).isoformat(),
            }
            for b in _active_bookings_for_day(master, day_start)
        ]
        return Response(busy)

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated])
    def walkin(self, request):
        """Master adds an offline (walk-in) client to today's queue in one tap.

        Minimal + fast: name and services are optional, time defaults to now.
        No client account is created — the booking is confirmed immediately and
        slot/working-hour checks are skipped (the master is in control).
        """
        master = MasterProfile.objects.filter(user=request.user).first()
        if not master:
            return Response({"detail": "Faqat ustalar uchun"}, status=403)

        name = (request.data.get("name") or "").strip()
        phone = (request.data.get("phone") or "").strip()
        service_ids = request.data.get("service_ids") or []
        services = list(Service.objects.filter(id__in=service_ids, master=master))

        start_raw = request.data.get("start_at")
        start_at = parse_datetime(start_raw) if start_raw else None
        if start_at is None:
            start_at = timezone.now()
        elif timezone.is_naive(start_at):
            start_at = timezone.make_aware(start_at)

        total_min = sum(s.duration_min for s in services) or DEFAULT_SLOT_MIN
        end_at = start_at + timedelta(minutes=total_min)
        price = sum((s.price for s in services), Decimal("0")) if services else None

        day_start = start_at.replace(hour=0, minute=0, second=0, microsecond=0)
        active_count = _active_bookings_for_day(master, day_start).count()

        # No name typed → auto-number the walk-in ("Mijoz 1", "Mijoz 2", …) so the
        # master can add clients fast without entering a name each time. Counts
        # today's existing walk-ins (booking with no account) for this master.
        if not name:
            walkin_count = _active_bookings_for_day(master, day_start).filter(
                client__isnull=True
            ).count()
            name = f"Mijoz {walkin_count + 1}"

        booking = Booking.objects.create(
            client=None,
            master=master,
            walk_in_name=name,
            walk_in_phone=phone,
            service=services[0] if services else None,
            start_at=start_at,
            end_at=end_at,
            price_snapshot=price,
            status=Booking.Status.CONFIRMED,
            queue_position=active_count + 1,
        )
        if services:
            booking.services.set(services)
        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)

    def _is_master_of(self, booking):
        return booking.master.user_id == self.request.user.id

    @action(detail=True, methods=["post"])
    def set_status(self, request, pk=None):
        booking = self.get_object()
        new_status = request.data.get("status")
        valid = dict(Booking.Status.choices)
        if new_status not in valid:
            return Response({"detail": "Noto'g'ri status"}, status=400)
        # Clients may only cancel; masters may set any status.
        if not self._is_master_of(booking) and new_status != Booking.Status.CANCELLED:
            return Response({"detail": "Ruxsat yo'q"}, status=403)
        # A booking can't be started before its scheduled time.
        if new_status == Booking.Status.IN_PROGRESS and timezone.now() < booking.start_at:
            return Response(
                {"detail": "Bron belgilangan vaqtidan oldin boshlab bo'lmaydi."},
                status=400,
            )
        booking.status = new_status
        booking.save(update_fields=["status", "updated_at"])
        return Response(BookingSerializer(booking).data)

    @action(detail=False, methods=["get"], url_path="queue/(?P<handle>[^/.]+)")
    def queue(self, request, handle=None):
        """Today's live queue for a master (dashboard view)."""
        master = MasterProfile.objects.filter(handle=handle).first()
        if not master:
            return Response({"detail": "Master topilmadi"}, status=404)
        today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        bookings = (
            Booking.objects.filter(
                master=master, start_at__gte=today, start_at__lt=today + timedelta(days=1)
            )
            .exclude(status=Booking.Status.CANCELLED)
            .order_by("queue_position", "start_at")
        )
        return Response(BookingSerializer(bookings, many=True).data)

    @action(detail=False, methods=["get"])
    def upcoming(self, request):
        """A client's upcoming bookings (for reminders / 'my bookings')."""
        now = timezone.now()
        bookings = self.get_queryset().filter(
            client=request.user,
            start_at__gte=now,
            status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED],
        )
        return Response(BookingSerializer(bookings, many=True).data)
