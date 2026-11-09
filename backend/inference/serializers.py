import numpy as np
from rest_framework import serializers

from . import conf
from .models import Calibration, Prediction


class SampleArrayField(serializers.Field):
    """JSON list of samples -> float ndarray of shape (samples, n_cols).

    Accepts sample-major [[TP9, AF7, AF8, TP10], ...] or channel-major
    [[TP9...], [AF7...], [AF8...], [TP10...]] and returns sample-major.
    Validated with numpy because a 60 s Muse recording is ~60k numbers.
    """

    def __init__(self, n_cols, **kwargs):
        self.n_cols = n_cols
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        try:
            arr = np.asarray(data, dtype=float)
        except (TypeError, ValueError):
            raise serializers.ValidationError("Must be a 2-D array of numbers.")
        if arr.ndim != 2:
            raise serializers.ValidationError("Must be a 2-D array of numbers.")
        if arr.shape[1] != self.n_cols and arr.shape[0] == self.n_cols:
            arr = arr.T   # channel-major -> sample-major
        if arr.shape[1] != self.n_cols:
            raise serializers.ValidationError(f"Each sample needs {self.n_cols} values; got shape {list(arr.shape)}.")
        if not np.isfinite(arr).all():
            raise serializers.ValidationError("Contains NaN/inf (dropped packets?). Fill or drop those samples first.")
        return arr

    def to_representation(self, value):
        return np.asarray(value).tolist()


MAX_HR_SAMPLES = 20000


class HRSampleSerializer(serializers.Serializer):
    timestamp = serializers.DateTimeField()
    bpm = serializers.FloatField(min_value=25, max_value=250)


class EEGInputSerializer(serializers.Serializer):
    eeg = SampleArrayField(n_cols=4, help_text="(samples, 4) µV in Muse order TP9, AF7, AF8, TP10")
    fs = serializers.IntegerField(min_value=64, max_value=1024, required=False,
                                  help_text="EEG sample rate in Hz (Muse 2: 256)")
    gyro = SampleArrayField(n_cols=3, required=False, help_text="(samples, 3), same time span as eeg")
    acc = SampleArrayField(n_cols=3, required=False, help_text="(samples, 3), same time span as eeg")
    started_at = serializers.DateTimeField(required=False,
                                           help_text="when the first EEG sample was recorded (default: now - duration)")
    hr = HRSampleSerializer(many=True, required=False, max_length=MAX_HR_SAMPLES,
                            help_text="heart-rate readings from the same time span: [{timestamp, bpm}, ...]")

    max_seconds_key = None   # set by subclasses

    def min_seconds(self):
        return self.context["detector"].win_s

    def validate(self, attrs):
        attrs.setdefault("fs", conf.get("DEFAULT_SAMPLE_RATE"))
        if ("gyro" in attrs) != ("acc" in attrs):
            raise serializers.ValidationError("Send both gyro and acc, or neither.")
        for key in ("gyro", "acc"):
            if key in attrs and len(attrs[key]) < 2:
                raise serializers.ValidationError({key: "Needs at least 2 samples."})
        seconds = len(attrs["eeg"]) / attrs["fs"]
        lo, hi = self.min_seconds(), conf.get(self.max_seconds_key)
        if seconds < lo:
            raise serializers.ValidationError({"eeg": f"{seconds:.1f} s of EEG at {attrs['fs']} Hz; need at least {lo:g} s."})
        if seconds > hi:
            raise serializers.ValidationError({"eeg": f"{seconds:.1f} s of EEG; at most {hi:g} s per request."})
        return attrs


class CalibrateInputSerializer(EEGInputSerializer):
    max_seconds_key = "MAX_CALIBRATION_SECONDS"

    def min_seconds(self):
        return max(conf.get("MIN_CALIBRATION_SECONDS"), self.context["detector"].win_s)


class PredictInputSerializer(EEGInputSerializer):
    max_seconds_key = "MAX_PREDICT_SECONDS"


class HeartRateInputSerializer(serializers.Serializer):
    """POST /api/inference/heart-rate/: heart rate on its own (e.g. from a watch at its own pace)."""
    samples = HRSampleSerializer(many=True, allow_empty=False, max_length=MAX_HR_SAMPLES)
    baseline = serializers.BooleanField(default=False, help_text="true = recorded during the calm calibration")


class CalibrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Calibration
        fields = ("id", "n_windows", "duration_seconds", "has_motion", "model_name", "recorded_at",
                  "baseline_hr_mean", "baseline_hr_std", "created_at")
        read_only_fields = fields


class PredictionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prediction
        fields = ("id", "calibration", "p_fear", "p_fear_smoothed", "fear_state", "valence", "arousal",
                  "quadrant", "window_probs", "n_windows", "duration_seconds", "motion_used",
                  "recorded_at", "hr_mean", "hr_delta", "created_at")
        read_only_fields = fields
