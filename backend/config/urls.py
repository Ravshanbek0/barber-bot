from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path


def healthz(_request):
    """Lightweight liveness probe for Railway/Render — no DB, always 200."""
    return HttpResponse("ok", content_type="text/plain")


api_v1 = [
    path("auth/", include("apps.accounts.urls")),
    path("admin/", include("apps.adminpanel.urls")),
    path("", include("apps.masters.urls")),
    path("", include("apps.bookings.urls")),
    path("", include("apps.chat.urls")),
]

urlpatterns = [
    path("healthz", healthz),
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
