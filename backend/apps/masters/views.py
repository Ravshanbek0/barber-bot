from math import asin, cos, radians, sin, sqrt

from django.db.models import Exists, OuterRef, Q
from django.utils.text import slugify
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response


def haversine_km(lat1, lng1, lat2, lng2):
    """Great-circle distance between two lat/lng points, in kilometres."""
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))

from .models import (
    Discount,
    MasterProfile,
    Review,
    SavedMaster,
    Service,
    WorkingHours,
)
from .permissions import IsOwnerMasterOrReadOnly
from apps.adminpanel.events import record
from .serializers import (
    DiscountSerializer,
    MasterDetailSerializer,
    MasterListSerializer,
    ReviewSerializer,
    ServiceSerializer,
    WorkingHoursSerializer,
)


class MasterViewSet(viewsets.ModelViewSet):
    queryset = (
        MasterProfile.objects.filter(is_active=True)
        .select_related("user")
        .prefetch_related("services", "working_hours", "discounts", "reviews")
    )
    permission_classes = [IsOwnerMasterOrReadOnly]
    lookup_field = "handle"
    search_fields = ["display_name", "handle", "city", "address", "services__name"]
    filterset_fields = ["city", "accepts_walkins"]
    ordering_fields = ["avg_rating", "reviews_count", "created_at"]

    def get_serializer_class(self):
        if self.action == "list":
            return MasterListSerializer
        return MasterDetailSerializer

    def get_queryset(self):
        """Public endpoints show only published masters; an authenticated owner
        can also reach their own draft (is_active=False) to fill it in / edit it.

        Without this a freshly-created master (always a draft) gets a 404 when
        saving their profile or location via /masters/<handle>/.
        """
        qs = (
            MasterProfile.objects.select_related("user")
            .prefetch_related("services", "working_hours", "discounts", "reviews")
        )
        user = self.request.user
        # Flag each master with whether this user bookmarked it (one extra
        # subquery, no N+1) so cards can render the saved state.
        if user.is_authenticated:
            qs = qs.annotate(
                _is_saved=Exists(
                    SavedMaster.objects.filter(user=user, master=OuterRef("pk"))
                )
            )
        if self.action == "list":
            return qs.filter(is_active=True)
        if user.is_authenticated:
            return qs.filter(Q(is_active=True) | Q(user=user))
        return qs.filter(is_active=True)

    def list(self, request, *args, **kwargs):
        """List masters; when ?lat=&lng= is given, sort by nearest distance."""
        lat = request.query_params.get("lat")
        lng = request.query_params.get("lng")
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            return super().list(request, *args, **kwargs)

        masters = list(self.filter_queryset(self.get_queryset()))
        for m in masters:
            if m.latitude is not None and m.longitude is not None:
                m.distance_km = haversine_km(lat, lng, m.latitude, m.longitude)
            else:
                m.distance_km = None
        masters.sort(key=lambda m: (m.distance_km is None, m.distance_km or 1e9))

        page = self.paginate_queryset(masters)
        serializer = self.get_serializer(page if page is not None else masters, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
        # Creating a profile promotes the account to a master.
        user = self.request.user
        if not user.is_master:
            user.is_master = True
            user.role = user.Role.MASTER
            user.save(update_fields=["is_master", "role"])

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        """The authenticated master's own profile (for the dashboard)."""
        profile = MasterProfile.objects.filter(user=request.user).first()
        if not profile:
            return Response({"detail": "Master profile topilmadi"}, status=404)
        return Response(MasterDetailSerializer(profile).data)

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def become(self, request):
        """One-tap "Usta bo'lish": create a profile from the Telegram identity.

        No long form — name/handle are derived from the user's Telegram data.
        Details (services, hours, photos, city) are filled later in the dashboard.
        """
        user = request.user
        existing = MasterProfile.objects.filter(user=user).first()
        if existing:
            # Re-entering after leaving master mode: the profile was kept, just
            # flip the role flags back on.
            if not user.is_master:
                user.is_master = True
                user.role = user.Role.MASTER
                user.save(update_fields=["is_master", "role"])
                record(user, kind="became_master", description="Usta rejimiga qaytdi")
            return Response(MasterDetailSerializer(existing).data)

        display_name = user.display_name
        if display_name.startswith("tg") or display_name.startswith("+"):
            display_name = "Yangi usta"
        # is_active=False: not listed in search until the master completes setup
        # (profile + working hours + services) and publishes.
        profile = MasterProfile.objects.create(
            user=user,
            handle=self._unique_handle(user),
            display_name=display_name,
            is_active=False,
        )
        user.is_master = True
        user.role = user.Role.MASTER
        user.save(update_fields=["is_master", "role"])
        record(user, kind="became_master", description="Yangi usta profili yaratdi")
        return Response(MasterDetailSerializer(profile).data, status=201)

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def leave(self, request):
        """Switch back to a regular client view (exit master mode).

        Keeps the master profile and all its data but unpublishes it and clears
        the role flags, so the user can browse/book as a client. Becoming a
        master again later restores the same profile.
        """
        user = request.user
        MasterProfile.objects.filter(user=user, is_active=True).update(is_active=False)
        user.is_master = False
        user.role = user.Role.CLIENT
        user.save(update_fields=["is_master", "role"])
        record(user, kind="left_master", description="Mijoz ko'rinishiga qaytdi")
        return Response({"detail": "Mijoz ko'rinishiga qaytdingiz", "is_master": False})

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def publish(self, request):
        """Go live: requires verified phone + required profile fields filled.

        Required: phone, display_name, city, >=1 service, working hours.
        """
        profile = MasterProfile.objects.filter(user=request.user).first()
        if not profile:
            return Response({"detail": "Profil topilmadi"}, status=404)

        missing = []
        if not request.user.is_registered:
            missing.append("phone")
        if not profile.display_name or profile.display_name == "Yangi usta":
            missing.append("display_name")
        if profile.latitude is None or profile.longitude is None:
            missing.append("location")
        if not profile.services.filter(is_active=True).exists():
            missing.append("services")
        if not profile.working_hours.exists():
            missing.append("hours")

        if missing:
            return Response(
                {"detail": "Majburiy maydonlar to'ldirilmagan", "missing": missing},
                status=400,
            )

        profile.is_active = True
        profile.save(update_fields=["is_active"])
        record(request.user, kind="published",
               description=f"@{profile.handle} profilini e'lon qildi")
        return Response(MasterDetailSerializer(profile).data)

    @staticmethod
    def _unique_handle(user):
        base = slugify(user.telegram_username or user.first_name or "") or f"usta{user.id}"
        handle = base
        i = 1
        while MasterProfile.objects.filter(handle=handle).exists():
            i += 1
            handle = f"{base}{i}"
        return handle

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def review(self, request, handle=None):
        master = self.get_object()
        serializer = ReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        Review.objects.update_or_create(
            master=master,
            author=request.user,
            defaults={
                "rating": serializer.validated_data["rating"],
                "comment": serializer.validated_data.get("comment", ""),
            },
        )
        master.recompute_rating()
        master.refresh_from_db()
        record(request.user, kind="review_created",
               description=f"{master.display_name} — {serializer.validated_data['rating']}⭐")
        return Response(MasterDetailSerializer(master, context={"request": request}).data)

    @action(detail=True, methods=["post", "delete"], permission_classes=[permissions.IsAuthenticated])
    def save(self, request, handle=None):
        """Bookmark (POST) or remove the bookmark (DELETE) for this master."""
        master = self.get_object()
        if request.method == "DELETE":
            SavedMaster.objects.filter(user=request.user, master=master).delete()
            return Response({"is_saved": False})
        SavedMaster.objects.get_or_create(user=request.user, master=master)
        return Response({"is_saved": True}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def saved(self, request):
        """Masters the current client has bookmarked, newest first."""
        saved_ids = list(
            SavedMaster.objects.filter(user=request.user)
            .order_by("-created_at")
            .values_list("master_id", flat=True)
        )
        by_id = {
            m.id: m
            for m in MasterProfile.objects.filter(id__in=saved_ids, is_active=True)
            .select_related("user")
            .prefetch_related("services", "working_hours", "discounts", "reviews")
        }
        ordered = [by_id[i] for i in saved_ids if i in by_id]
        for m in ordered:
            m._is_saved = True
        serializer = MasterListSerializer(ordered, many=True, context={"request": request})
        return Response(serializer.data)


class _OwnedBase(viewsets.ModelViewSet):
    """Helper for service / hours / discount CRUD scoped to the current master."""

    permission_classes = [IsOwnerMasterOrReadOnly]

    def _master(self):
        return MasterProfile.objects.filter(user=self.request.user).first()

    def perform_create(self, serializer):
        serializer.save(master=self._master())


class ServiceViewSet(_OwnedBase):
    serializer_class = ServiceSerializer
    filterset_fields = ["master"]

    def get_queryset(self):
        return Service.objects.select_related("master").all()


class WorkingHoursViewSet(_OwnedBase):
    serializer_class = WorkingHoursSerializer
    filterset_fields = ["master"]

    def get_queryset(self):
        return WorkingHours.objects.select_related("master").all()

    def create(self, request, *args, **kwargs):
        """Idempotent upsert — one row per (master, weekday).

        The dashboard saves all seven weekdays in one go; if the client doesn't
        yet know a row's id (e.g. right after first creating it) a plain POST
        would hit the unique (master, weekday) constraint and fail. Upserting
        keeps "Saqlash" working on every save.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        obj, created = WorkingHours.objects.update_or_create(
            master=self._master(),
            weekday=data["weekday"],
            defaults={
                "start_time": data["start_time"],
                "end_time": data["end_time"],
                "is_day_off": data.get("is_day_off", False),
            },
        )
        out = self.get_serializer(obj)
        code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(out.data, status=code)


class DiscountViewSet(_OwnedBase):
    serializer_class = DiscountSerializer
    filterset_fields = ["master"]

    def get_queryset(self):
        return Discount.objects.select_related("master").all()

    def perform_create(self, serializer):
        discount = serializer.save(master=self._master())
        record(self.request.user, kind="discount_created",
               description=f"−{discount.percent}% — {discount.title}")


