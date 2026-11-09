from django.conf import settings
from django.db import models
from django.utils import timezone


class Calibration(models.Model):
    """A user's ~60 s calm baseline. Every prediction is relative to one of these.

    It also marks the start of a recording session: the session is this calibration
    plus every prediction and heart-rate sample recorded against it.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="calibrations")
    baseline = models.JSONField()        # mean of each feature over the calm windows (fed to the model)
    baseline_std = models.JSONField()    # spread of each feature (used to scale valence/arousal)
    n_windows = models.PositiveIntegerField()
    duration_seconds = models.FloatField()
    has_motion = models.BooleanField(default=False)
    model_name = models.CharField(max_length=100)   # which .joblib it was made for
    recorded_at = models.DateTimeField(default=timezone.now)   # when the calm recording started (session t=0)
    baseline_hr_mean = models.FloatField(null=True, blank=True)   # bpm, from heart rate sent during calibration
    baseline_hr_std = models.FloatField(null=True, blank=True)
    # Set when this calibration came from analyzing an uploaded Bloom session (session_analysis.py)
    eeg_session = models.ForeignKey(
        "users.EEGSession", null=True, blank=True, on_delete=models.CASCADE, related_name="calibrations",
    )
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
    recorded_at = models.DateTimeField(default=timezone.now)   # start of this EEG chunk (client clock if sent)
    hr_mean = models.FloatField(null=True, blank=True)    # mean bpm of heart-rate samples inside this chunk
    hr_delta = models.FloatField(null=True, blank=True)   # hr_mean - calibration baseline, bpm
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "created_at"], name="inference_pred_user_idx")]

    def __str__(self):
        return f"{self.user} {self.fear_state} p={self.p_fear_smoothed:.2f} @ {self.created_at:%H:%M:%S}"


class HeartRateSample(models.Model):
    """One heart-rate reading (from the Muse PPG, a watch, a chest strap...) in a session."""

    calibration = models.ForeignKey(Calibration, on_delete=models.CASCADE, related_name="heart_rate")
    timestamp = models.DateTimeField()
    bpm = models.FloatField()
    is_baseline = models.BooleanField(default=False)   # recorded during the calm calibration

    class Meta:
        ordering = ["timestamp"]
        constraints = [
            # re-sending the same samples (e.g. after a network retry) is harmless
            models.UniqueConstraint(fields=["calibration", "timestamp"], name="inference_hr_unique_ts"),
        ]

    def __str__(self):
        return f"{self.bpm:.0f} bpm @ {self.timestamp:%H:%M:%S}"
