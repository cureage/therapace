"""Fear detection from Muse 2 EEG, vendored from the dreamer ML project (commit 51ac42a).

features.py is an unchanged copy, so training and inference compute features identically.
realtime.py was adapted: relative imports, and the per-user baseline is passed in
instead of being stored on the (shared) detector.
"""
from .realtime import FearDetector

__all__ = ["FearDetector"]
