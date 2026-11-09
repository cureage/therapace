"""EEG / heart-rate input -> Calibration, Prediction and HeartRateSample rows. Views stay thin."""
from datetime import timedelta

import numpy as np
from django.db.models import Avg, F, StdDev, Sum
from django.utils import timezone

from . import conf, registry
from .affect import affect_scores, quadrant
from .models import Calibration, HeartRateSample, Prediction


class NoCalibration(Exception):
    pass


def _start_time(started_at, eeg, fs):
    return started_at or timezone.now() - timedelta(seconds=len(eeg) / fs)


def calibrate(user, eeg, fs, gyro=None, acc=None, started_at=None, hr=None):
    det = registry.get_detector()
    has_motion = det.uses_motion and gyro is not None and acc is not None
    mean, std, n = det.compute_baseline(eeg, fs, gyro, acc)
    calib = Calibration.objects.create(
        user=user, baseline=mean, baseline_std=std, n_windows=n,
        duration_seconds=len(eeg) / fs, has_motion=has_motion, model_name=registry.model_name(),
        recorded_at=_start_time(started_at, eeg, fs),
    )
    if hr:
        add_heart_rate(calib, hr, baseline=True)
        calib.refresh_from_db()
    return calib


def latest_calibration(user):
    return (Calibration.objects.filter(user=user, model_name=registry.model_name())
            .order_by("-created_at").first())


def require_calibration(user):
    calib = latest_calibration(user)
    if calib is None:
        raise NoCalibration("No calibration for this user. POST ~60 s of calm EEG to /api/inference/calibrate/ first.")
    return calib


def add_heart_rate(calib, samples, baseline=False):
    """Store [{timestamp, bpm}, ...]. Baseline samples also update the calibration's HR baseline."""
    HeartRateSample.objects.bulk_create(
        [HeartRateSample(calibration=calib, timestamp=s["timestamp"], bpm=s["bpm"], is_baseline=baseline)
         for s in samples],
        ignore_conflicts=True,   # duplicate timestamps (re-sent data) are skipped
    )
    if baseline:
        stats = calib.heart_rate.filter(is_baseline=True).aggregate(m=Avg("bpm"), s=StdDev("bpm"))
        Calibration.objects.filter(pk=calib.pk).update(baseline_hr_mean=stats["m"], baseline_hr_std=stats["s"])
    return len(samples)


def predict(user, eeg, fs, gyro=None, acc=None, started_at=None, hr=None, calib=None):
    """Score one EEG chunk against `calib`, or the user's latest calibration when not given."""
    det = registry.get_detector()
    calib = calib or require_calibration(user)

    feats = det.window_features(eeg, fs, gyro, acc)
    probs = det.predict_windows(feats, calib.baseline)
    aff = [affect_scores(det.normalized(f, calib.baseline), calib.baseline_std) for f in feats]
    p = float(np.mean(probs))
    valence = float(np.mean([a["valence"] for a in aff]))
    arousal = float(np.mean([a["arousal"] for a in aff]))

    start = _start_time(started_at, eeg, fs)
    duration = len(eeg) / fs

    # Single 4 s windows are noisy (README: AUC 0.68 per window, 0.80 over 30 s), so the
    # fear/calm decision uses a window-weighted mean over the preceding SMOOTHING_SECONDS of
    # *recording* time (recorded_at), so batched or delayed uploads smooth correctly.
    since = start - timedelta(seconds=conf.get("SMOOTHING_SECONDS"))
    recent = Prediction.objects.filter(calibration=calib, recorded_at__gte=since, recorded_at__lt=start).aggregate(
        wsum=Sum(F("p_fear") * F("n_windows")), n=Sum("n_windows"))
    wsum, n_prev = recent["wsum"] or 0.0, recent["n"] or 0
    smoothed = (wsum + p * len(probs)) / (n_prev + len(probs))

    # Heart rate for this chunk: samples sent with it, or sent separately to /heart-rate/.
    if hr:
        add_heart_rate(calib, hr)
    hr_mean = calib.heart_rate.filter(
        is_baseline=False, timestamp__gte=start, timestamp__lte=start + timedelta(seconds=duration),
    ).aggregate(m=Avg("bpm"))["m"]
    hr_delta = hr_mean - calib.baseline_hr_mean if hr_mean is not None and calib.baseline_hr_mean is not None else None

    return Prediction.objects.create(
        user=user, calibration=calib,
        p_fear=p, p_fear_smoothed=smoothed,
        fear_state=Prediction.FearState.FEAR if smoothed >= conf.get("FEAR_THRESHOLD") else Prediction.FearState.CALM,
        valence=valence, arousal=arousal, quadrant=quadrant(valence, arousal),
        window_probs=probs, n_windows=len(probs), duration_seconds=duration,
        motion_used=det.uses_motion and gyro is not None and acc is not None,
        recorded_at=start, hr_mean=hr_mean, hr_delta=hr_delta,
    )
