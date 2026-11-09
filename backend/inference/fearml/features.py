"""Shared feature extraction for DREAMER (training) and Muse 2 + ECG (live).

Every feature the model sees is computed here, so training and runtime use
identical code. Channel order everywhere is the Muse 2 order:
    TP9, AF7, AF8, TP10
"""
import numpy as np
from scipy.signal import butter, sosfiltfilt, welch, find_peaks, resample_poly

EEG_FS = 128          # DREAMER rate; Muse (256 Hz) is downsampled to this
CHANNELS = ["TP9", "AF7", "AF8", "TP10"]
BANDS = {"theta": (4, 8), "alpha": (8, 13), "beta": (13, 30), "gamma": (30, 45)}
# delta (<4 Hz) is left out on purpose: on AF7/AF8 it is dominated by blinks.


# ----------------------------------------------------------------------------- EEG
def prepare_eeg(x, fs):
    """x: (samples, 4) in Muse channel order. Returns band-passed signal at 128 Hz."""
    x = np.asarray(x, dtype=float)
    if fs != EEG_FS:
        g = np.gcd(int(fs), EEG_FS)
        x = resample_poly(x, EEG_FS // g, int(fs) // g, axis=0)
    sos = butter(4, [1, 45], btype="band", fs=EEG_FS, output="sos")
    return sosfiltfilt(sos, x, axis=0)


def _band_powers(x):
    """x: (samples, ch) filtered EEG @128 Hz -> dict band -> (ch,) absolute power."""
    f, pxx = welch(x, fs=EEG_FS, nperseg=min(len(x), 2 * EEG_FS), axis=0)
    out = {}
    for name, (lo, hi) in BANDS.items():
        m = (f >= lo) & (f < hi)
        out[name] = np.trapezoid(pxx[m], f[m], axis=0)
    return out


def eeg_features(x):
    """x: one window (samples, 4) of *prepared* EEG. Returns dict of features.

    All features are log-scale or ratios, so device gain / reference
    differences mostly cancel, and baseline subtraction makes sense.
    """
    bp = _band_powers(x)
    total = sum(bp.values()) + 1e-12
    feats = {}
    for i, ch in enumerate(CHANNELS):
        for b in BANDS:
            feats[f"eeg_rel_{b}_{ch}"] = np.log(bp[b][i] / total[i] + 1e-12)
        feats[f"eeg_beta_alpha_{ch}"] = np.log((bp["beta"][i] + 1e-12) / (bp["alpha"][i] + 1e-12))
        feats[f"eeg_theta_beta_{ch}"] = np.log((bp["theta"][i] + 1e-12) / (bp["beta"][i] + 1e-12))
    la = np.log(bp["alpha"] + 1e-12)
    lb = np.log(bp["beta"] + 1e-12)
    # Frontal alpha asymmetry (right - left). Lower values = relatively more
    # right-frontal activity = withdrawal / negative affect.
    feats["eeg_faa_frontal"] = la[2] - la[1]          # AF8 - AF7
    feats["eeg_faa_temporal"] = la[3] - la[0]         # TP10 - TP9
    feats["eeg_fba_frontal"] = lb[2] - lb[1]          # beta asymmetry
    return feats


# ----------------------------------------------------------------------------- ECG
def detect_rpeaks(ecg, fs):
    """Simple, dependency-free R-peak detector. Returns peak times in seconds."""
    ecg = np.asarray(ecg, dtype=float)
    sos = butter(3, [5, 20], btype="band", fs=fs, output="sos")
    y = sosfiltfilt(sos, ecg)
    # Pick polarity: R-peaks are the larger-magnitude side.
    if np.percentile(y, 99.5) < -np.percentile(y, 0.5):
        y = -y
    y = np.clip(y, 0, None)
    thr = 0.35 * np.percentile(y, 98)
    peaks, _ = find_peaks(y, height=thr, distance=int(0.33 * fs))  # max ~180 bpm
    return peaks / fs


def clean_rr(rr):
    """Drop physiologically implausible / ectopic RR intervals (seconds)."""
    rr = rr[(rr > 0.33) & (rr < 1.6)]
    if len(rr) >= 3:
        med = np.median(rr)
        rr = rr[np.abs(rr - med) < 0.25 * med]
    return rr


def hrv_features(rr):
    """rr: RR intervals (s) inside one window. Full HRV set (needs raw ECG / RR)."""
    rr = clean_rr(np.asarray(rr, dtype=float))
    if len(rr) < 4:
        return None
    hr = 60.0 / rr
    d = np.diff(rr) * 1000
    return {
        "ecg_hr_mean": hr.mean(),
        "ecg_hr_std": hr.std(),
        "ecg_log_rmssd": np.log(np.sqrt(np.mean(d ** 2)) + 1e-6),
        "ecg_log_sdnn": np.log(rr.std() * 1000 + 1e-6),
        "ecg_pnn50": np.mean(np.abs(d) > 50),
    }


HR_ONLY = ["ecg_hr_mean", "ecg_hr_std"]   # what you can get from a plain HR stream


# ----------------------------------------------------------------- baseline norm
def normalize(feats, base):
    """Express a window's features relative to the subject's calm baseline.

    EEG & log-HRV features are already log-scale -> subtract.
    HR -> difference in bpm. pNN50 -> difference.
    """
    return {k: v - base[k] for k, v in feats.items() if k in base}


def mean_feats(dicts):
    dicts = [d for d in dicts if d is not None]
    if not dicts:
        return None
    return {k: float(np.mean([d[k] for d in dicts])) for k in dicts[0]}
