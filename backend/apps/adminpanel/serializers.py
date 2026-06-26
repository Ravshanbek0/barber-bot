from rest_framework import serializers

from .models import ActivityEvent


class ActivityEventSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = ActivityEvent
        fields = [
            "id",
            "kind",
            "kind_label",
            "actor",
            "actor_label",
            "actor_tg_id",
            "description",
            "meta",
            "created_at",
        ]


class AdminUserSerializer(serializers.Serializer):
    """Flat row for the users table. Built from annotated User querysets."""

    id = serializers.IntegerField()
    name = serializers.CharField(source="display_name")
    phone = serializers.CharField()
    telegram_id = serializers.IntegerField(allow_null=True)
    telegram_username = serializers.CharField(allow_blank=True)
    role = serializers.CharField()
    is_master = serializers.BooleanField()
    is_registered = serializers.BooleanField()
    created_at = serializers.DateTimeField()
    last_seen = serializers.DateTimeField(allow_null=True)
    events_count = serializers.IntegerField()
    bookings_count = serializers.IntegerField()
