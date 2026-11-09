from django.conf import settings
from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager

# Create your models here.

class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_email_verified", True)
        if not extra_fields["is_staff"] or not extra_fields["is_superuser"]:
            raise ValueError("Superuser must have is_staff=True and is_superuser=True")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    is_email_verified = models.BooleanField(default=False)
    streak = models.PositiveIntegerField(default=0)
    max_streak = models.PositiveIntegerField(default=0)
    last_activity_date = models.DateField(blank=True, null=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []  # createsuperuser will only ask for email + password

    objects = UserManager()

    def __str__(self):
        return self.email


class Fear(models.Model):
    class Category(models.TextChoices):
        SPIDERS = "spiders"
        DOGS = "dogs"
        CLOWNS = "clowns"
        OTHER = "other"  # free-text fears from onboarding that match no category above


    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="fears")
    category = models.CharField(max_length=32, choices=Category.choices)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)            # the user's own words; useful in the AI prompt
    # 0–10, self-rated at onboarding; empty for fears first seen on the conquer page
    initial_severity = models.PositiveSmallIntegerField(null=True, blank=True)
    current_level = models.PositiveSmallIntegerField(default=1)  # how far up the ladder they are
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

class AIVideo(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        GENERATING = "generating"
        READY = "ready"
        FAILED = "failed"

    fear = models.ForeignKey(Fear, on_delete=models.CASCADE, related_name="videos")
    # Conquer page: 1 = cartoon-like and far away … 5 = right up close
    intensity = models.PositiveSmallIntegerField()
    prompt = models.TextField()                           # the exact prompt sent to the generator
    provider = models.CharField(max_length=50, blank=True)  # model that made it, e.g. "gemini-omni-1.2-flash"
    external_job_id = models.CharField(max_length=255, blank=True)
    # Client-generated idempotency key: retrying a request returns the same video instead of paying twice
    request_key = models.CharField(max_length=64, null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    error_message = models.TextField(blank=True)
    video_url = models.URLField(blank=True)
    # Generated MP4 in MEDIA_ROOT, streamed to the owner by GET /api/videos/{id}/stream/
    video_file = models.FileField(upload_to="exposure_videos/", blank=True)
    thumbnail_url = models.URLField(blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)  # requested exposure length
    # Generated clip length (the model caps clips at 15 s); the app loops it to fill duration_seconds
    clip_duration_seconds = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["request_key"], name="aivideo_request_key_unique"),
        ]


class EEGSession(models.Model):
    class Status(models.TextChoices):
        COMPLETE = "complete", "Complete"
        PARTIAL = "partial", "Partial"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="eeg_sessions",
    )
    # Session metadata; time-series data belongs in readings, not one growing JSON blob.
    session_data = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.COMPLETE)
    recording_key = models.CharField(max_length=64, null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "recording_key"], name="user_recording_key_unique")
        ]
        indexes = [
            models.Index(
                fields=["user", "created_at"],
                name="users_eeg_user_created_idx",
            ),
        ]

    def __str__(self):
        return f"EEG Session for {self.user.email} at {self.created_at}"


class SessionReading(models.Model):
    class Type(models.TextChoices):
        EEG = "eeg", "EEG"
        HEART_RATE = "heart_rate", "Heart rate"

    session = models.ForeignKey(EEGSession, on_delete=models.CASCADE, related_name="readings")
    type = models.CharField(max_length=16, choices=Type.choices)
    device_id = models.CharField(max_length=255)
    timestamp = models.DateTimeField(help_text="Measurement time, or frontend notification receipt time.")
    # Heart rate: {"unit": "bpm", "value": 78}; EEG: {"unit": "uV", "channels": {...}}.
    data = models.JSONField()
    # Packet sequence disambiguates Muse packets with the same millisecond timestamp.
    source_index = models.PositiveBigIntegerField(default=0)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp", "id"]
        indexes = [models.Index(fields=["session", "type", "timestamp"], name="session_type_time_idx")]
        constraints = [models.UniqueConstraint(
            fields=["session", "type", "device_id", "timestamp", "source_index"],
            name="session_reading_unique",
        )]


class StreakDay(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="streak_days",
    )
    activity_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "activity_date"],
                name="users_streak_day_unique",
            ),
        ]
        ordering = ["-activity_date"]

    def __str__(self):
        return f"Streak day for {self.user.email} on {self.activity_date}"
