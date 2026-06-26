from django.apps import AppConfig


class AdminpanelConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.adminpanel"
    verbose_name = "Admin panel / faoliyat"

    def ready(self):
        # Connect the Booking activity receiver.
        from . import signals  # noqa: F401
