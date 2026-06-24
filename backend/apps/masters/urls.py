from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("masters", views.MasterViewSet, basename="master")
router.register("services", views.ServiceViewSet, basename="service")
router.register("working-hours", views.WorkingHoursViewSet, basename="working-hours")
router.register("discounts", views.DiscountViewSet, basename="discount")
router.register("portfolio", views.PortfolioViewSet, basename="portfolio")

urlpatterns = router.urls
