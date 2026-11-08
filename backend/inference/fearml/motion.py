"""Head-motion features, copied from dreamer/build_ekm.py.

Only this function is needed at inference time; copying it avoids pulling in
build_ekm.py (a training script) and its pandas dependency. Keep it identical
to the original so live features match what the model was trained on.
"""
import numpy as np


def motion_features(gyro, acc):
    """Head-movement intensity in the window (log scale)."""
    g = np.linalg.norm(gyro, axis=1)
    a = np.linalg.norm(acc, axis=1)
    return {"mot_log_gyro_std": np.log(g.std() + 1e-3),
            "mot_log_gyro_mean": np.log(g.mean() + 1e-3),
            "mot_log_acc_std": np.log(a.std() + 1e-4)}
