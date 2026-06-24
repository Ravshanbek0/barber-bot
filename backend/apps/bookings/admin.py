from django.contrib import admin

from .models import Booking


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("id", "client", "master", "service", "start_at", "queue_position", "status")
    list_filter = ("status", "master")
    search_fields = ("client__phone", "master__handle")
    date_hierarchy = "start_at"
