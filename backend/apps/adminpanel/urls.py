from django.urls import path

from . import views

urlpatterns = [
    path("login/", views.admin_login),
    path("overview/", views.overview),
    path("users/", views.users),
    path("masters/", views.masters),
    path("bookings/", views.bookings),
    path("activity/", views.ActivityList.as_view()),
]
