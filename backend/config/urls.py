from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

api_v1 = [
    path("auth/", include("apps.accounts.urls")),
    path("", include("apps.masters.urls")),
    path("", include("apps.bookings.urls")),
    path("", include("apps.chat.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
