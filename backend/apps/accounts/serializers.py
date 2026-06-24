from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "phone",
            "first_name",
            "last_name",
            "display_name",
            "role",
            "is_master",
            "photo_url",
            "telegram_username",
            "is_phone_verified",
            "is_registered",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "phone",
            "is_phone_verified",
            "is_registered",
            "created_at",
            "is_master",
            "photo_url",
            "telegram_username",
        ]


class OtpRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    channel = serializers.ChoiceField(
        choices=["sms", "telegram"], default="sms", required=False
    )


class OtpVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=6)
    # Optional profile data collected at register-on-action time
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    as_master = serializers.BooleanField(required=False, default=False)


class TelegramAuthSerializer(serializers.Serializer):
    """Payload from the Telegram Login Widget."""

    id = serializers.IntegerField()
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    username = serializers.CharField(required=False, allow_blank=True)
    photo_url = serializers.CharField(required=False, allow_blank=True)
    auth_date = serializers.IntegerField()
    hash = serializers.CharField()
