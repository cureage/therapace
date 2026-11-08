"""EEG arrays in -> Calibration / Prediction rows out. Views stay thin; this is the logic."""
from datetime import timedelta

import numpy as np
from django.db.models import F, Sum
from django.utils import timezone

from . import conf, registry
from .affect import affect_scores, quadrant
from .models import Calibration, Prediction


class NoCalibration(Exception):
    pass


def calibrate(user, eeg, fs, gyro=None, acc=None):
    det = registry.get_detector()
    has_motion = det.uses_motion and gyro is not None and acc is not None
    mean, std, n = det.compute_baseline(eeg, fs, gyro, acc)
    return Calibration.objects.create(
        user=user, baseline=mean, baseline_std=std, n_windows=n,
        duration_seconds=len(eeg) / fs, has_motion=has_motion, model_name=registry.model_name(),
    )


def latest_calibration(user):
    return (Calibration.objects.filter(user=user, model_name=registry.model_name())
            .order_by("-created_at").first())


def predict(user, eeg, fs, gyro=None, acc=None):
    det = registry.get_detector()
    calib = latest_calibration(user)
    if calib is None:
        raise NoCalibration("No calibration for this user. POST ~60 s of calm EEG to /api/inference/calibrate/ first.")

    feats = det.window_features(eeg, fs, gyro, acc)
    probs = det.predict_windows(feats, calib.baseline)
    aff = [affect_scores(det.normalized(f, calib.baseline), calib.baseline_std) for f in feats]
    p = float(np.mean(probs))
    valence = float(np.mean([a["valence"] for a in aff]))
    arousal = float(np.mean([a["arousal"] for a in aff]))

    # Single 4 s windows are noisy (README: AUC 0.68 per window, 0.80 over 30 s), so the
    # fear/calm decision uses a window-weighted mean over the recent past.
    since = timezone.now() - timedelta(seconds=conf.get("SMOOTHING_SECONDS"))
    recent = Prediction.objects.filter(user=user, calibration=calib, created_at__gte=since).aggregate(
        wsum=Sum(F("p_fear") * F("n_windows")), n=Sum("n_windows"))
    wsum, n_prev = recent["wsum"] or 0.0, recent["n"] or 0
    smoothed = (wsum + p * len(probs)) / (n_prev + len(probs))

    return Prediction.objects.create(
        user=user, calibration=calib,
        p_fear=p, p_fear_smoothed=smoothed,
        fear_state=Prediction.FearState.FEAR if smoothed >= conf.get("FEAR_THRESHOLD") else Prediction.FearState.CALM,
        valence=valence, arousal=arousal, quadrant=quadrant(valence, arousal),
        window_probs=probs, n_windows=len(probs), duration_seconds=len(eeg) / fs,
        motion_used=det.uses_motion and gyro is not None and acc is not None,
    )
