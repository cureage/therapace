"""Inference settings. Override any key with settings.INFERENCE = {...}."""
from django.conf import settings

DEFAULTS = {
    "FEAR_EEG_MODEL_PATH": None,       # required: path to fear_eeg_model.joblib
    "FEAR_THRESHOLD": 0.6,             # smoothed P(fear) >= this -> "fear". README: 0.5 flags ~31% of calm windows
    "SMOOTHING_SECONDS": 30,           # average predictions over this much recent time (README: ~30 s)
    "MIN_CALIBRATION_SECONDS": 30,     # ask the user for ~60 s; reject anything under this
    "MAX_CALIBRATION_SECONDS": 180,
    "MAX_PREDICT_SECONDS": 60,         # longest chunk accepted by /predict/
    "DEFAULT_SAMPLE_RATE": 256,        # Muse 2 EEG rate
}


def get(key):
    return getattr(settings, "INFERENCE", {}).get(key, DEFAULTS[key])
