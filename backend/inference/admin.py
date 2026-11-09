from django.contrib import admin

from .models import Calibration, HeartRateSample, Prediction


@admin.register(HeartRateSample)
class HeartRateSampleAdmin(admin.ModelAdmin):
    list_display = ("id", "calibration", "timestamp", "bpm", "is_baseline")
    list_filter = ("is_baseline",)
    search_fields = ("calibration__user__email",)


@admin.register(Calibration)
class CalibrationAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "duration_seconds", "n_windows", "has_motion", "model_name", "created_at")
    list_filter = ("model_name", "has_motion")
    search_fields = ("user__email",)
    readonly_fields = ("created_at",)


@admin.register(Prediction)
class PredictionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "fear_state", "p_fear", "p_fear_smoothed", "valence", "arousal",
                    "quadrant", "n_windows", "created_at")
    list_filter = ("fear_state", "quadrant")
    search_fields = ("user__email",)
    readonly_fields = ("created_at",)
