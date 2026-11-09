"""Valence / arousal estimates from baseline-normalised EEG features.

The trained model only predicts P(fear). There is no trained valence/arousal
model (the dreamer "quadrant" task scored ~0.55 AUC and was not saved), so
these are the standard EEG heuristics, scored relative to the user's own
calm baseline:

  arousal ~ beta/alpha power ratio (more beta, less alpha = more activated),
            averaged over the 4 channels
  valence ~ frontal alpha asymmetry, AF8 - AF7 log alpha
            (relatively more right-frontal activity = withdrawal / negative)

Each is a z-score against the baseline's window-to-window spread, squashed to
-1..1. 0 means "same as during calibration". Treat them as indicative signals,
not validated measurements.
"""
import math

from .fearml.features import CHANNELS

STD_FLOOR = 0.05   # log units; stops a very steady baseline from blowing up the z-score
Z_SCALE = 2.0      # z = 2 maps to tanh(1) = 0.76


def _z(delta, std):
    return delta / max(std, STD_FLOOR)


def _squash(z):
    return math.tanh(z / Z_SCALE)


def affect_scores(norm, base_std):
    """norm: one window's features minus baseline; base_std: baseline std per feature."""
    arousal_z = sum(_z(norm[f"eeg_beta_alpha_{ch}"], base_std.get(f"eeg_beta_alpha_{ch}", 0.0))
                    for ch in CHANNELS) / len(CHANNELS)
    valence_z = _z(norm["eeg_faa_frontal"], base_std.get("eeg_faa_frontal", 0.0))
    return {"valence": _squash(valence_z), "arousal": _squash(arousal_z)}


def quadrant(valence, arousal):
    """Circumplex quadrant relative to baseline."""
    if arousal >= 0:
        return "stressed" if valence < 0 else "excited"
    return "low" if valence < 0 else "relaxed"
