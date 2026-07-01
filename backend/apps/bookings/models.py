from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.masters.models import MasterProfile, Service


class Booking(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Kutilmoqda"
        CONFIRMED = "confirmed", "Tasdiqlandi"
        IN_PROGRESS = "in_progress", "Jarayonda"
        COMPLETED = "completed", "Yakunlandi"
        CANCELLED = "cancelled", "Bekor qilindi"
        NO_SHOW = "no_show", "Kelmadi"

    # Null for walk-ins (offline clients the master adds manually — no account).
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bookings",
        null=True,
        blank=True,
    )
    # Walk-in client details (used only when ``client`` is null).
    walk_in_name = models.CharField(max_length=120, blank=True)
    walk_in_phone = models.CharField(max_length=20, blank=True)
    master = models.ForeignKey(
        MasterProfile, on_delete=models.CASCADE, related_name="bookings"
    )
    # Primary service (kept for backward compatibility / single-service views).
    # The full set of services in one visit lives in ``services`` below.
    service = models.ForeignKey(
        Service, on_delete=models.SET_NULL, null=True, related_name="bookings"
    )
    # One appointment can bundle several services (e.g. Soqol + Soch olish);
    # they share a single start time and the visit length is their combined
    # duration. ``service`` mirrors the first of these.
    services = models.ManyToManyField(Service, blank=True, related_name="combo_bookings")
    start_at = models.DateTimeField()
    end_at = models.DateTimeField(null=True, blank=True)
    queue_position = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING
    )
    note = models.CharField(max_length=255, blank=True)
    price_snapshot = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    reminder_sent = models.BooleanField(default=False)
    # Pre-visit confirmation flow: the bot pings the client 15, then again at
    # 10, minutes before the start if they still haven't answered.
    # confirm_stage tracks how far that's gone (0=none, 1=15-min sent,
    # 2=10-min sent); client_confirmed flips when they tap "I'll come". If
    # they never do, auto_reject_unconfirmed cancels the booking once the
    # start time arrives. The client agrees to this flow (a checkbox) when
    # booking.
    confirm_stage = models.PositiveSmallIntegerField(default=0)
    client_confirmed = models.BooleanField(default=False)
    # Telegram message ids of the booking cards (master's card with action
    # buttons, client's status card). Stored so a status change edits the same
    # message in place instead of sending a new one — one card per booking.
    master_message_id = models.BigIntegerField(null=True, blank=True)
    client_message_id = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_at"]
        indexes = [models.Index(fields=["master", "start_at"])]

    def __str__(self):
        return f"{self.client_label()} -> {self.master} @ {self.start_at:%Y-%m-%d %H:%M}"

    def client_label(self):
        """Display name for the client — the account holder, or the walk-in
        name the master typed, or a generic fallback."""
        if self.client_id:
            return self.client.display_name
        return self.walk_in_name or "Mijoz"

    @property
    def is_walk_in(self):
        return self.client_id is None

    @property
    def is_overdue(self):
        """Scheduled time has passed but the visit hasn't started yet — the
        master neither began nor closed it. Surfaced as a marker, not auto-acted."""
        return (
            self.status in (self.Status.PENDING, self.Status.CONFIRMED)
            and self.start_at < timezone.now()
        )

    def selected_services(self):
        """All services in this visit — the combo set if present, else the
        single ``service`` (for older single-service bookings)."""
        combo = list(self.services.all())
        if combo:
            return combo
        return [self.service] if self.service else []

    def total_duration_min(self):
        svc = self.selected_services()
        return sum(s.duration_min for s in svc) if svc else 30

    def services_label(self):
        svc = self.selected_services()
        return ", ".join(s.name for s in svc) if svc else "Xizmat"
