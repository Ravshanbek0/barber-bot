from django.contrib import admin

from .models import (
    Discount,
    MasterProfile,
    PortfolioItem,
    Review,
    Service,
    WorkingHours,
)


class ServiceInline(admin.TabularInline):
    model = Service
    extra = 1


class WorkingHoursInline(admin.TabularInline):
    model = WorkingHours
    extra = 0


@admin.register(MasterProfile)
class MasterProfileAdmin(admin.ModelAdmin):
    list_display = ("handle", "display_name", "city", "avg_rating", "reviews_count", "is_active")
    list_filter = ("city", "is_active", "accepts_walkins")
    search_fields = ("handle", "display_name", "city")
    inlines = [ServiceInline, WorkingHoursInline]


admin.site.register([PortfolioItem, Service, WorkingHours, Discount, Review])
