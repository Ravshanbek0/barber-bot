from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("otp/request/", views.otp_request, name="otp-request"),
    path("otp/verify/", views.otp_verify, name="otp-verify"),
    path("telegram/webapp/", views.telegram_webapp, name="telegram-webapp"),
    path("telegram/", views.TelegramAuthView.as_view(), name="telegram-auth"),
    path("dev-login/", views.dev_login, name="dev-login"),
    path("phone/", views.register_phone, name="register-phone"),
    path("phone/otp/request/", views.phone_otp_request, name="phone-otp-request"),
    path("phone/otp/verify/", views.phone_otp_verify, name="phone-otp-verify"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", views.MeView.as_view(), name="me"),
]
