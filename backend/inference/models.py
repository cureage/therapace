from django.conf import settings
from django.db import models


class Calibration(models.Model):
    """A user's ~60 s calm baseline. Every prediction is relative to one of these."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="calibrations")
    baseline = models.JSONField()        # mean of each feature over the calm windows (fed to the model)
    baseline_std = models.JSONField()    # spread of each feature (used to scale valence/arousal)
    n_windows = models.PositiveIntegerField()
    duration_seconds = models.FloatField()
    has_motion = models.BooleanField(default=False)
    model_name = models.CharField(max_length=100)   # which .joblib it was made for
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "created_at"], name="inference_calib_user_idx")]

    def __str__(self):
        return f"Calibration {self.pk} for {self.user} ({self.duration_seconds:.0f} s)"


class Prediction(models.Model):
    class FearState(models.TextChoices):
        FEAR = "fear"
        CALM = "calm"

    class Quadrant(models.TextChoices):
        STRESSED = "stressed"   # negative valence, high arousal
        EXCITED = "excited"     # positive valence, high arousal
        RELAXED = "relaxed"     # positive valence, low arousal
        LOW = "low"             # negative valence, low arousal

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="fear_predictions")
    calibration = models.ForeignKey(Calibration, on_delete=models.CASCADE, related_name="predictions")
    p_fear = models.FloatField()               # mean P(fear) over this chunk's windows
    p_fear_smoothed = models.FloatField()      # rolling mean over the last SMOOTHING_SECONDS
    fear_state = models.CharField(max_length=8, choices=FearState.choices)
    valence = models.FloatField()              # -1..1 relative to baseline
    arousal = models.FloatField()              # -1..1 relative to baseline
    quadrant = models.CharField(max_length=10, choices=Quadrant.choices)
    window_probs = models.JSONField(default=list)
    n_windows = models.PositiveSmallIntegerField()
    duration_seconds = models.FloatField()
    motion_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "created_at"], name="inference_pred_user_idx")]

    def __str__(self):
        return f"{self.user} {self.fear_state} p={self.p_fear_smoothed:.2f} @ {self.created_at:%H:%M:%S}"
