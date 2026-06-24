from django.conf import settings
from django.db import models
from django.utils import timezone


class MasterProfile(models.Model):
    """Instagram-style public profile for a barber/master."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="master_profile",
    )
    handle = models.SlugField(max_length=40, unique=True)  # @username style
    display_name = models.CharField(max_length=120)
    bio = models.TextField(blank=True)
    city = models.CharField(max_length=80, blank=True)
    address = models.CharField(max_length=255, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    instagram = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)
    accepts_walkins = models.BooleanField(default=True)
    avg_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    reviews_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-avg_rating", "-reviews_count"]

    def __str__(self):
        return f"@{self.handle}"

    def recompute_rating(self):
        """Recalculate avg_rating / reviews_count from this master's reviews.

        Uses a fresh query (not the related manager) so it is correct even right
        after a review was created elsewhere with a prefetched cache.
        """
        agg = Review.objects.filter(master=self)
        count = agg.count()
        self.reviews_count = count
        self.avg_rating = round(sum(r.rating for r in agg) / count, 2) if count else 0
        self.save(update_fields=["reviews_count", "avg_rating"])


class Service(models.Model):
    """A bookable service with price and duration."""

    master = models.ForeignKey(
        MasterProfile, on_delete=models.CASCADE, related_name="services"
    )
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    duration_min = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["price"]

    def __str__(self):
        return f"{self.name} ({self.master.handle})"


class WorkingHours(models.Model):
    """Recurring weekly availability per weekday."""

    class Weekday(models.IntegerChoices):
        MON = 0, "Dushanba"
        TUE = 1, "Seshanba"
        WED = 2, "Chorshanba"
        THU = 3, "Payshanba"
        FRI = 4, "Juma"
        SAT = 5, "Shanba"
        SUN = 6, "Yakshanba"

    master = models.ForeignKey(
        MasterProfile, on_delete=models.CASCADE, related_name="working_hours"
    )
    weekday = models.IntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_day_off = models.BooleanField(default=False)

    class Meta:
        unique_together = ("master", "weekday")
        ordering = ["weekday"]


class Discount(models.Model):
    """A promotion the master announces to clients."""

    master = models.ForeignKey(
        MasterProfile, on_delete=models.CASCADE, related_name="discounts"
    )
    title = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True)
    percent = models.PositiveSmallIntegerField(default=0)
    service = models.ForeignKey(
        Service, on_delete=models.SET_NULL, null=True, blank=True, related_name="discounts"
    )
    starts_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_live(self):
        now = timezone.now()
        if not self.is_active or self.starts_at > now:
            return False
        return self.ends_at is None or self.ends_at >= now


class Review(models.Model):
    master = models.ForeignKey(
        MasterProfile, on_delete=models.CASCADE, related_name="reviews"
    )
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("master", "author")
