from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BookingViewSet, run_cron_jobs

router = DefaultRouter()
router.register("bookings", BookingViewSet, basename="booking")

urlpatterns = router.urls + [
    path("cron/run/", run_cron_jobs),
]
