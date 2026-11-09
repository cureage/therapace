"""Holds the EEG fear detector, loaded once when Django starts (see apps.py)."""
import logging
from pathlib import Path

from . import conf

logger = logging.getLogger(__name__)

_detector = None
_model_name = ""
_error = "model not loaded yet"


class ModelUnavailable(Exception):
    pass


def load():
    global _detector, _model_name, _error
    path = conf.get("FEAR_EEG_MODEL_PATH")
    try:
        if not path:
            raise FileNotFoundError("settings.INFERENCE['FEAR_EEG_MODEL_PATH'] is not set")
        from .fearml import FearDetector   # imports numpy/scipy/sklearn

        _detector = FearDetector(path)
        _model_name = Path(path).name
        _error = ""
        logger.info("Loaded fear EEG model %s (win_s=%s, motion=%s)", _model_name, _detector.win_s, _detector.uses_motion)
    except Exception as exc:   # keep Django (migrate, admin, auth) usable without the model
        _detector, _error = None, f"{type(exc).__name__}: {exc}"
        logger.error("Could not load fear EEG model from %s: %s", path, _error)


def get_detector():
    if _detector is None:
        raise ModelUnavailable(_error)
    return _detector


def model_name():
    return _model_name


def status():
    return {"model_loaded": _detector is not None, "model": _model_name or None, "error": _error or None}
