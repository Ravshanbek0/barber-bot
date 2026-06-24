from rest_framework import serializers

from apps.masters.models import Review, Service

from .models import Booking


class BookingSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.display_name", read_only=True)
    client_phone = serializers.CharField(source="client.phone", read_only=True)
    master_name = serializers.CharField(source="master.display_name", read_only=True)
    master_handle = serializers.CharField(source="master.handle", read_only=True)
    # Combined label / total length across every service in the visit.
    service_name = serializers.SerializerMethodField()
    service_duration = serializers.SerializerMethodField()
    service_items = serializers.SerializerMethodField()
    # Write-only: the list of services booked together in one appointment.
    service_ids = serializers.PrimaryKeyRelatedField(
        many=True, write_only=True, required=False,
        queryset=Service.objects.all(), source="services",
    )
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    # Whether this booking's client has already reviewed this master — lets the
    # client UI hide the "Baholash" button once a rating has been submitted.
    reviewed = serializers.SerializerMethodField()

    def get_reviewed(self, obj):
        return Review.objects.filter(
            master_id=obj.master_id, author_id=obj.client_id
        ).exists()

    def get_service_name(self, obj):
        return obj.services_label()

    def get_service_duration(self, obj):
        return obj.total_duration_min()

    def get_service_items(self, obj):
        return [
            {"id": s.id, "name": s.name, "duration_min": s.duration_min, "price": str(s.price)}
            for s in obj.selected_services()
        ]

    class Meta:
        model = Booking
        fields = [
            "id",
            "client",
            "client_name",
            "client_phone",
            "master",
            "master_name",
            "master_handle",
            "service",
            "service_ids",
            "service_name",
            "service_duration",
            "service_items",
            "start_at",
            "end_at",
            "queue_position",
            "status",
            "status_label",
            "note",
            "price_snapshot",
            "reviewed",
            "created_at",
        ]
        read_only_fields = [
            "client",
            "queue_position",
            "price_snapshot",
            "end_at",
            "created_at",
        ]

    def validate(self, attrs):
        master = attrs.get("master")
        services = attrs.get("services") or ([attrs["service"]] if attrs.get("service") else [])
        if not services:
            raise serializers.ValidationError("Kamida bitta xizmat tanlang.")
        if master and any(s.master_id != master.id for s in services):
            raise serializers.ValidationError("Xizmat ushbu masterga tegishli emas")
        return attrs

    def create(self, validated_data):
        from django.db import transaction

        services = validated_data.pop("services", [])
        if services:
            # Mirror the first service onto the FK for single-service displays.
            validated_data.setdefault("service", services[0])
        with transaction.atomic():
            booking = super().create(validated_data)
            if services:
                booking.services.set(services)
        return booking
