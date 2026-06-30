from rest_framework import serializers

from .models import (
    Discount,
    MasterProfile,
    Review,
    SavedMaster,
    Service,
    WorkingHours,
)


class SavedStateMixin:
    """Adds an `is_saved` flag — whether the requesting user bookmarked this
    master. Prefers the `_is_saved` annotation (set on list querysets) and falls
    back to a direct lookup so the field is correct on any endpoint."""

    def get_is_saved(self, obj):
        annotated = getattr(obj, "_is_saved", None)
        if annotated is not None:
            return annotated
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return SavedMaster.objects.filter(user=request.user, master=obj).exists()


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = ["id", "name", "description", "price", "duration_min", "is_active"]

    def validate_duration_min(self, value):
        # A zero/empty duration breaks slot generation (every slot would be
        # zero-length) — require a real visit length.
        if value is None or value < 5:
            raise serializers.ValidationError("Davomiylik kamida 5 daqiqa bo'lishi kerak.")
        return value


class WorkingHoursSerializer(serializers.ModelSerializer):
    weekday_label = serializers.CharField(source="get_weekday_display", read_only=True)

    class Meta:
        model = WorkingHours
        fields = ["id", "weekday", "weekday_label", "start_time", "end_time", "is_day_off"]


class DiscountSerializer(serializers.ModelSerializer):
    is_live = serializers.BooleanField(read_only=True)

    class Meta:
        model = Discount
        fields = [
            "id",
            "title",
            "description",
            "percent",
            "service",
            "starts_at",
            "ends_at",
            "is_active",
            "is_live",
            "created_at",
        ]


class ReviewSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.display_name", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "rating", "comment", "author_name", "created_at"]
        read_only_fields = ["author_name", "created_at"]


class MasterListSerializer(SavedStateMixin, serializers.ModelSerializer):
    """Compact payload for search results / cards."""

    min_price = serializers.SerializerMethodField()
    discount_percent = serializers.SerializerMethodField()
    services_count = serializers.IntegerField(source="services.count", read_only=True)
    distance_km = serializers.SerializerMethodField()
    is_saved = serializers.SerializerMethodField()

    class Meta:
        model = MasterProfile
        fields = [
            "id",
            "handle",
            "display_name",
            "city",
            "address",
            "latitude",
            "longitude",
            "avg_rating",
            "reviews_count",
            "accepts_walkins",
            "min_price",
            "discount_percent",
            "services_count",
            "distance_km",
            "is_saved",
        ]

    def _cheapest_service(self, obj):
        active = [s for s in obj.services.all() if s.is_active]
        return min(active, key=lambda s: s.price) if active else None

    def get_min_price(self, obj):
        s = self._cheapest_service(obj)
        return s.price if s else None

    def get_discount_percent(self, obj):
        """Best live discount that applies to the cheapest service, so the card's
        "dan" price and the −% badge always refer to the same service. Discounts
        with no `service` are shop-wide and apply to every service."""
        s = self._cheapest_service(obj)
        if not s:
            return 0
        pct = 0
        for d in obj.discounts.all():
            if d.is_live and d.percent and (d.service_id is None or d.service_id == s.id):
                pct = max(pct, d.percent)
        return min(pct, 90)

    def get_distance_km(self, obj):
        d = getattr(obj, "distance_km", None)
        return round(d, 1) if d is not None else None


class MasterDetailSerializer(SavedStateMixin, serializers.ModelSerializer):
    services = ServiceSerializer(many=True, read_only=True)
    working_hours = WorkingHoursSerializer(many=True, read_only=True)
    discounts = serializers.SerializerMethodField()
    reviews = ReviewSerializer(many=True, read_only=True)
    is_saved = serializers.SerializerMethodField()

    class Meta:
        model = MasterProfile
        fields = [
            "id",
            "handle",
            "display_name",
            "bio",
            "city",
            "address",
            "latitude",
            "longitude",
            "instagram",
            "is_active",
            "accepts_walkins",
            "avg_rating",
            "reviews_count",
            "services",
            "working_hours",
            "discounts",
            "reviews",
            "is_saved",
            "created_at",
        ]

    def get_discounts(self, obj):
        live = [d for d in obj.discounts.all() if d.is_live]
        return DiscountSerializer(live, many=True).data
