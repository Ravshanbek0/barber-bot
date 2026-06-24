from rest_framework import serializers

from .models import (
    Discount,
    MasterProfile,
    PortfolioItem,
    Review,
    Service,
    WorkingHours,
)


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


class PortfolioItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioItem
        fields = ["id", "image", "caption", "created_at"]


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


class MasterListSerializer(serializers.ModelSerializer):
    """Compact payload for search results / cards."""

    min_price = serializers.SerializerMethodField()
    services_count = serializers.IntegerField(source="services.count", read_only=True)
    distance_km = serializers.SerializerMethodField()

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
            "cover",
            "avg_rating",
            "reviews_count",
            "accepts_walkins",
            "min_price",
            "services_count",
            "distance_km",
        ]

    def get_min_price(self, obj):
        prices = [s.price for s in obj.services.all() if s.is_active]
        return min(prices) if prices else None

    def get_distance_km(self, obj):
        d = getattr(obj, "distance_km", None)
        return round(d, 1) if d is not None else None


class MasterDetailSerializer(serializers.ModelSerializer):
    services = ServiceSerializer(many=True, read_only=True)
    portfolio = PortfolioItemSerializer(many=True, read_only=True)
    working_hours = WorkingHoursSerializer(many=True, read_only=True)
    discounts = serializers.SerializerMethodField()
    reviews = ReviewSerializer(many=True, read_only=True)

    class Meta:
        model = MasterProfile
        fields = [
            "id",
            "handle",
            "display_name",
            "bio",
            "cover",
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
            "portfolio",
            "working_hours",
            "discounts",
            "reviews",
            "created_at",
        ]

    def get_discounts(self, obj):
        live = [d for d in obj.discounts.all() if d.is_live]
        return DiscountSerializer(live, many=True).data
