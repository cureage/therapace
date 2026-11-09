from django.conf import settings
from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager

from django.conf import settings

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


    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="fears")
    category = models.CharField(max_length=32, choices=Category.choices)
    name = models.CharField(max_length=100)               
    description = models.TextField(blank=True)            # the user's own words; useful in the AI prompt
    initial_severity = models.PositiveSmallIntegerField() # 0–10, self-rated at onboarding
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
    intensity = models.PositiveSmallIntegerField()        # 1 = cartoon spider far away … 10 = spider on your hand
    prompt = models.TextField()                           # the exact prompt sent to the generator
    provider = models.CharField(max_length=50, blank=True)  # "runway", "veo", "sora", …
    external_job_id = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    error_message = models.TextField(blank=True)
    video_url = models.URLField(blank=True)               # or a FileField if you download it
    thumbnail_url = models.URLField(blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class EEGSession(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="eeg_sessions",
    )
    session_data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["user", "created_at"],
                name="users_eeg_user_created_idx",
            ),
        ]

    def __str__(self):
        return f"EEG Session for {self.user.email} at {self.created_at}"


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
