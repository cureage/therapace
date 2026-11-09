"""Apply the trained EEG model to live Muse 2 data.

Adapted from dreamer/realtime.py for a multi-user server:
  * relative imports (features.py, motion.py live next to this file);
  * the detector is stateless: compute_baseline() RETURNS the per-user baseline
    and predict_windows() takes it as an argument, so one detector loaded at
    startup can serve every user;
  * any recording >= one window is split into win_s windows with 50% overlap
    (the same windowing set_baseline() used);
  * motion (gyro/acc) is optional: if it is missing, the mot_* features are set
    to "no change from baseline" (0 after normalisation).

eeg:        (samples, 4) in Muse order TP9, AF7, AF8, TP10 (µV), at muse_fs (default 256)
gyro / acc: (samples, 3), any rate; they are aligned to the EEG by fraction of the recording.
"""
import joblib
import numpy as np

from .features import EEG_FS, eeg_features, mean_feats, normalize, prepare_eeg
from .motion import motion_features

MOTION_COLS = ("mot_log_gyro_std", "mot_log_gyro_mean", "mot_log_acc_std")


class FearDetector:
    def __init__(self, path):
        b = joblib.load(path)
        self.model, self.cols = b["model"], list(b["features"])
        self.win_s = float(b.get("win_s", 10))
        self.label_rule = b.get("label_rule", "")
        self.dataset = b.get("dataset", "")
        self.uses_motion = any(c.startswith("mot_") for c in self.cols)
        if not any(c.startswith("eeg_") for c in self.cols):
            raise ValueError(f"{path} is not an EEG model (features: {self.cols})")

    def min_samples(self, muse_fs=256):
        """Raw samples needed for one window at the device rate."""
        return int(np.ceil(self.win_s * muse_fs))

    def window_features(self, eeg, muse_fs=256, gyro=None, acc=None):
        """Split a recording into win_s windows (50% overlap) -> list of raw feature dicts."""
        x = prepare_eeg(eeg, muse_fs)
        n = int(self.win_s * EEG_FS)
        if len(x) < n:
            raise ValueError(f"need at least {self.win_s:g} s of EEG ({self.min_samples(muse_fs)} samples at {muse_fs} Hz)")
        with_motion = self.uses_motion and gyro is not None and acc is not None
        out = []
        for i in range(0, len(x) - n + 1, n // 2):
            f = eeg_features(x[i:i + n])
            if with_motion:
                f.update(motion_features(_slice(gyro, i / len(x), (i + n) / len(x)),
                                         _slice(acc, i / len(x), (i + n) / len(x))))
            out.append({k: float(v) for k, v in f.items()})
        return out

    def compute_baseline(self, eeg, muse_fs=256, gyro=None, acc=None):
        """~60 s of calm data -> (mean features, std of features, number of windows)."""
        wins = self.window_features(eeg, muse_fs, gyro, acc)
        mean = mean_feats(wins)
        std = {k: float(np.std([w[k] for w in wins])) for k in mean}
        return mean, std, len(wins)

    def normalized(self, feats, base):
        """Raw window features -> features relative to the baseline, as the model expects."""
        f = normalize(feats, base)
        if self.uses_motion:
            for c in MOTION_COLS:
                f.setdefault(c, 0.0)   # no motion data: assume no change from baseline
        missing = [c for c in self.cols if c not in f]
        if missing:
            raise ValueError(f"missing features for this model: {missing}")
        return f

    def predict_windows(self, window_feats, base):
        """List of raw window feature dicts + baseline -> list of P(fear), one per window."""
        X = np.array([[self.normalized(f, base)[c] for c in self.cols] for f in window_feats])
        return [float(p) for p in self.model.predict_proba(X)[:, 1]]


def _slice(arr, start_frac, end_frac):
    arr = np.asarray(arr, dtype=float)
    return arr[int(start_frac * len(arr)):max(int(end_frac * len(arr)), int(start_frac * len(arr)) + 2)]
