from django.conf import settings
from django.db import models
from django.utils import timezone


class ActivityEvent(models.Model):
    """A single thing that happened in the product — who did what, when.

    This is the heart of the owner's admin panel: it lets them watch real usage
    (who entered the app, who pressed /start in the bot, who became a master,
    who booked …) without reading the database by hand. Recording is best-effort
    and must never break the user-facing flow, so writers go through
    :func:`apps.adminpanel.events.record`, which swallows errors.
    """

    class Kind(models.TextChoices):
        LOGIN = "login", "Ilovaga kirdi"
        BOT_START = "bot_start", "Botda /start bosdi"
        JOINED = "joined", "Yangi foydalanuvchi"
        REGISTERED = "registered", "Telefonni tasdiqladi"
        BECAME_MASTER = "became_master", "Usta bo'ldi"
        PUBLISHED = "published", "Profilni e'lon qildi"
        LEFT_MASTER = "left_master", "Usta rejimidan chiqdi"
        DISCOUNT_CREATED = "discount_created", "Chegirma e'lon qildi"
        BOOKING_CREATED = "booking_created", "Bron qildi"
        BOOKING_STATUS = "booking_status", "Bron holatini o'zgartirdi"
        REVIEW_CREATED = "review_created", "Baho qoldirdi"

    # actor may be null for anonymous /start presses or after a user is deleted;
    # actor_label keeps a readable name snapshot so old events still make sense.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="activity_events",
    )
    actor_label = models.CharField(max_length=160, blank=True)
    actor_tg_id = models.BigIntegerField(null=True, blank=True)
    kind = models.CharField(max_length=24, choices=Kind.choices, db_index=True)
    description = models.CharField(max_length=255, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["kind", "created_at"])]

    def __str__(self):
        return f"{self.get_kind_display()} — {self.actor_label or '—'}"
