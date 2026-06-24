from django.contrib import admin

from .models import OtpCode, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("id", "phone", "display_name", "role", "is_master", "is_phone_verified")
    list_filter = ("role", "is_master", "is_phone_verified")
    search_fields = ("phone", "first_name", "last_name")


@admin.register(OtpCode)
class OtpCodeAdmin(admin.ModelAdmin):
    list_display = ("phone", "code", "channel", "is_used", "attempts", "created_at")
    list_filter = ("channel", "is_used")
    search_fields = ("phone",)
