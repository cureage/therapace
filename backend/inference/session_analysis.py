"""Analyze an uploaded Bloom session: heart rate and estimated fear, calm baseline vs exposure.

Bloom starts recording on the Preparation screen, where the user breathes calmly while the video
is generated, and puts the moment the video started in session_data["exposure_started_at"].
Readings before that are the baseline; readings after it are the exposure.

Fear uses the same model and Calibration/Prediction rows as the live /api/inference/ endpoints:
the baseline calibrates the model, then the exposure is scored in short chunks to make a timeline.
Analyzing a session again replaces its previous result.
"""
from collections import Counter

import numpy as np
from django.db import transaction
from django.utils.dateparse import parse_datetime

from users.models import SessionReading

from . import conf, registry, report, services
from .fearml.features import CHANNELS
from .models import Calibration

MUSE_FS = 256
EXPOSURE_CHUNK_SECONDS = 8   # one prediction per chunk gives the fear timeline
MAX_BASELINE_SECONDS = 120   # of a long wait, use the most recent, calmest part


def analyze_session(session):
    """Analyze `session`, store the result on it and return it."""
    readings = list(session.readings.all())
    exposure_start = _exposure_start(session)
    notes = []

    heart = [(r.timestamp, float(r.data["value"])) for r in readings
             if r.type == SessionReading.Type.HEART_RATE]
    frames = muse_frames([r for r in readings if r.type == SessionReading.Type.EEG])
    if exposure_start is None:
        # Older app versions started recording with the video, so there is no baseline.
        baseline_hr, exposure_hr = [], heart
        baseline_frames, exposure_frames = [], frames
    else:
        baseline_hr = [(t, bpm) for t, bpm in heart if t < exposure_start]
        exposure_hr = [(t, bpm) for t, bpm in heart if t >= exposure_start]
        baseline_frames = [f for f in frames if f[0] < exposure_start]
        exposure_frames = [f for f in frames if f[0] >= exposure_start]

    if not heart:
        notes.append("No heart-rate readings were recorded. Connect a heart-rate sensor in Settings "
                     "before your next session.")
    with transaction.atomic():
        Calibration.objects.filter(eeg_session=session).delete()
        fear = _fear(session, baseline_frames, exposure_frames, baseline_hr, exposure_hr,
                     exposure_start, notes)
        session.analysis = {
            "session_id": session.pk,
            "baseline_seconds": _seconds_between(session.started_at, exposure_start),
            "exposure_seconds": _seconds_between(exposure_start or session.started_at, session.ended_at),
            "heart_rate": _heart_rate(
                [b for _, b in baseline_hr],
                exposure_hr,
                exposure_start or (exposure_hr[0][0] if exposure_hr else None),
            ),
            "fear": fear,
            "notes": notes,
        }
        session.save(update_fields=["analysis"])
    return session.analysis


def muse_frames(readings):
    """Regroup stored Muse readings into time-ordered (timestamp, samples x 4) frames.

    Bloom stores each channel's packet as its own reading; the four packets from one Muse
    notification share a timestamp and have consecutive sequence ids. Frames missing a channel
    are dropped. Readings stored as one sample with all channels ({"channels": {...}}) also work.
    """
    if not readings:
        return []
    device = Counter(r.device_id for r in readings).most_common(1)[0][0]
    frames, current, current_ts = [], {}, None

    def flush():
        lengths = {len(current.get(c, ())) for c in CHANNELS}
        if len(lengths) == 1 and 0 not in lengths:
            frames.append((current_ts, np.column_stack([current[c] for c in CHANNELS])))

    for reading in sorted(readings, key=lambda r: (r.timestamp, r.source_index)):
        if reading.device_id != device:
            continue
        data = reading.data
        if isinstance(data.get("channels"), dict):
            values = data["channels"]
            if all(c in values for c in CHANNELS):
                frames.append((reading.timestamp, np.array([[values[c] for c in CHANNELS]], dtype=float)))
            continue
        channel, samples = data.get("channel"), data.get("samples")
        if channel not in CHANNELS or not samples:
            continue
        if current and (reading.timestamp != current_ts or channel in current):
            flush()
            current = {}
        current_ts = reading.timestamp
        current[channel] = samples
    if current:
        flush()
    return frames


def _fear(session, baseline_frames, exposure_frames, baseline_hr, exposure_hr, exposure_start, notes):
    if not baseline_frames and not exposure_frames:
        notes.append("No Muse EEG was recorded, so fear could not be estimated. Connect the headband "
                     "in Settings before your next session.")
        return None
    try:
        det = registry.get_detector()
    except registry.ModelUnavailable:
        notes.append("The fear model is not available on the server.")
        return None

    baseline_frames = _latest_frames(baseline_frames, MAX_BASELINE_SECONDS * MUSE_FS)
    baseline_seconds = sum(len(block) for _, block in baseline_frames) / MUSE_FS
    needed = max(conf.get("MIN_CALIBRATION_SECONDS"), det.win_s)
    if baseline_seconds < needed:
        notes.append(f"The calm baseline had {baseline_seconds:.0f} s of EEG; at least {needed:g} s is "
                     "needed to estimate fear. Keep the headband on during preparation.")
        return None
    exposure_seconds = sum(len(block) for _, block in exposure_frames) / MUSE_FS
    if exposure_seconds < det.win_s:
        notes.append(f"The video had {exposure_seconds:.0f} s of EEG; at least {det.win_s:g} s is "
                     "needed to estimate fear.")
        return None

    calib = services.calibrate(
        session.user, np.vstack([block for _, block in baseline_frames]), MUSE_FS,
        started_at=baseline_frames[0][0], hr=_hr_samples(baseline_hr),
    )
    Calibration.objects.filter(pk=calib.pk).update(eeg_session=session)
    if exposure_hr:
        services.add_heart_rate(calib, _hr_samples(exposure_hr))
    for chunk_start, chunk in _chunks(exposure_frames, int(det.win_s * MUSE_FS)):
        services.predict(session.user, chunk, MUSE_FS, started_at=chunk_start, calib=calib)

    calib.refresh_from_db()
    summary = report.summary(calib)
    origin = exposure_start or exposure_frames[0][0]
    timeline = [
        {
            "seconds": round((p.recorded_at - origin).total_seconds(), 1),
            "p_fear": round(p.p_fear, 3),
            "p_fear_smoothed": round(p.p_fear_smoothed, 3),
            "heart_rate_bpm": None if p.hr_mean is None else round(p.hr_mean, 1),
        }
        for p in calib.predictions.order_by("recorded_at")
    ]
    return {"calibration_id": calib.pk, **summary["fear"], "affect": summary["affect"],
            "timeline": timeline}


def _chunks(frames, min_rows):
    """Split frames into ~EXPOSURE_CHUNK_SECONDS chunks; a short tail joins the previous chunk."""
    target = EXPOSURE_CHUNK_SECONDS * MUSE_FS
    chunks, blocks, rows, start = [], [], 0, None
    for timestamp, block in frames:
        if not blocks:
            start = timestamp
        blocks.append(block)
        rows += len(block)
        if rows >= target:
            chunks.append((start, np.vstack(blocks)))
            blocks, rows = [], 0
    if blocks:
        tail = np.vstack(blocks)
        if rows >= min_rows or not chunks:
            chunks.append((start, tail))
        else:
            chunks[-1] = (chunks[-1][0], np.vstack([chunks[-1][1], tail]))
    return chunks


def _latest_frames(frames, max_rows):
    kept, rows = [], 0
    for frame in reversed(frames):
        if rows + len(frame[1]) > max_rows:
            break
        kept.append(frame)
        rows += len(frame[1])
    return kept[::-1]


def _heart_rate(baseline, exposure, exposure_start):
    if not exposure:
        return None
    base = float(np.mean(baseline)) if baseline else None
    values = [bpm for _, bpm in exposure]
    mean = float(np.mean(values))
    step = max(1, (len(exposure) + 119) // 120)
    samples = exposure[::step]
    if samples[-1] != exposure[-1]:
        samples.append(exposure[-1])
    return {
        "baseline_bpm": None if base is None else round(base, 1),
        "exposure_mean_bpm": round(mean, 1),
        "exposure_max_bpm": round(float(np.max(values)), 1),
        "change_bpm": None if base is None else round(mean - base, 1),
        "timeline": [
            {
                "seconds": round((timestamp - exposure_start).total_seconds(), 1),
                "bpm": round(bpm, 1),
            }
            for timestamp, bpm in samples
        ] if exposure_start is not None else [],
    }


def _hr_samples(heart):
    return [{"timestamp": t, "bpm": bpm} for t, bpm in heart] or None


def _exposure_start(session):
    value = (session.session_data or {}).get("exposure_started_at")
    return parse_datetime(value) if isinstance(value, str) else None


def _seconds_between(start, end):
    if start is None or end is None:
        return None
    return round(max((end - start).total_seconds(), 0.0), 1)
