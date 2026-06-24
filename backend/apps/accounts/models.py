from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Phone-number based manager (no username)."""

    use_in_migrations = True

    def _create_user(self, phone, password, **extra):
        if not phone:
            raise ValueError("Phone number is required")
        user = self.model(phone=phone, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, phone, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(phone, password, **extra)

    def create_superuser(self, phone, password, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self._create_user(phone, password, **extra)


class User(AbstractUser):
    """Custom user keyed on phone number; supports user + master roles."""

    class Role(models.TextChoices):
        CLIENT = "client", "Client"
        MASTER = "master", "Master"

    username = None
    first_name = models.CharField(max_length=80, blank=True)
    last_name = models.CharField(max_length=80, blank=True)
    phone = models.CharField(max_length=20, unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.CLIENT)
    is_master = models.BooleanField(default=False)
    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)
    telegram_username = models.CharField(max_length=64, blank=True)
    photo_url = models.URLField(blank=True)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    is_phone_verified = models.BooleanField(default=False)
    # True once the user completes registration: phone (client) or
    # becoming a master via Telegram. False = guest (browse-only).
    is_registered = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.phone

    @property
    def display_name(self):
        full = f"{self.first_name} {self.last_name}".strip()
        return full or self.phone


class OtpCode(models.Model):
    """Short-lived one-time code sent over SMS or Telegram."""

    class Channel(models.TextChoices):
        SMS = "sms", "SMS"
        TELEGRAM = "telegram", "Telegram"

    phone = models.CharField(max_length=20, db_index=True)
    code = models.CharField(max_length=6)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.SMS)
    is_used = models.BooleanField(default=False)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.phone} / {self.code}"

    @property
    def is_expired(self):
        from django.utils import timezone as _tz

        return _tz.now() >= self.expires_at
