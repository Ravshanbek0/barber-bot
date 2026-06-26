from django.contrib import admin

from .models import ActivityEvent


@admin.register(ActivityEvent)
class ActivityEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "actor_label", "description")
    list_filter = ("kind", "created_at")
    search_fields = ("actor_label", "description")
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"
