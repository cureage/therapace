import numpy as np
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from users.models import User

from . import registry
from .affect import quadrant
from .models import Calibration, Prediction

FS = 256


def recording(seconds, alpha=10.0, beta=3.0, seed=0, motion=True):
    """Synthetic Muse-like data: alpha + beta sines plus noise on 4 channels."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * FS)) / FS
    eeg = np.stack([alpha * np.sin(2 * np.pi * 10 * t + k) + beta * np.sin(2 * np.pi * 20 * t + k)
                    for k in range(4)], axis=1) + rng.normal(0, 5, (len(t), 4))
    body = {"eeg": eeg.round(3).tolist(), "fs": FS}
    if motion:
        n = int(seconds * 52)
        body["gyro"] = rng.normal(0, 1, (n, 3)).round(4).tolist()
        body["acc"] = (rng.normal(0, 0.1, (n, 3)) + [0, 0, 1]).round(4).tolist()
    return body


class InferenceAPITests(APITestCase):
    def setUp(self):
        self.assertTrue(registry.status()["model_loaded"], registry.status())
        self.user = User.objects.create_user(email="eeg@example.com", password="pass-12345")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.user).key}")

    def calibrate(self, **kw):
        return self.client.post("/api/inference/calibrate/", recording(60, **kw), format="json")

    def predict(self, seconds=4, **kw):
        return self.client.post("/api/inference/predict/", recording(seconds, **kw), format="json")

    def test_status_describes_expected_input(self):
        r = self.client.get("/api/inference/status/")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["model_loaded"])
        self.assertEqual(r.data["model"], "fear_eeg_model.joblib")
        self.assertEqual(r.data["channels"], ["TP9", "AF7", "AF8", "TP10"])
        self.assertEqual(r.data["window_seconds"], 4.0)
        self.assertIsNone(r.data["calibration"])

    def test_predict_before_calibration_is_409(self):
        r = self.predict()
        self.assertEqual(r.status_code, 409, r.data)

    def test_calibrate_then_predict(self):
        r = self.calibrate()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["n_windows"], 29)          # 60 s, 4 s windows, 2 s step
        self.assertTrue(r.data["has_motion"])
        calib = Calibration.objects.get(user=self.user)
        self.assertIn("eeg_faa_frontal", calib.baseline)

        r = self.predict(alpha=3, beta=12, seed=1)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(0 <= r.data["p_fear"] <= 1)
        self.assertTrue(-1 <= r.data["valence"] <= 1 and -1 <= r.data["arousal"] <= 1)
        self.assertGreater(r.data["arousal"], 0)            # more beta, less alpha than baseline
        self.assertIn(r.data["fear_state"], {"fear", "calm"})
        self.assertEqual(r.data["quadrant"], quadrant(r.data["valence"], r.data["arousal"]))
        self.assertEqual(r.data["n_windows"], 1)
        self.assertEqual(r.data["calibration"], calib.pk)

        r = self.client.get("/api/inference/status/")
        self.assertEqual(r.data["calibration"]["id"], calib.pk)

    def test_baseline_like_data_has_near_zero_affect(self):
        self.calibrate()
        r = self.predict(seed=7)   # same signal mix as the calibration
        self.assertLess(abs(r.data["arousal"]), 0.5)
        self.assertLess(abs(r.data["valence"]), 0.5)

    def test_longer_chunk_is_split_into_windows(self):
        self.calibrate()
        r = self.predict(seconds=10)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["n_windows"], 4)
        self.assertEqual(len(r.data["window_probs"]), 4)

    def test_smoothing_averages_recent_windows(self):
        self.calibrate()
        a = self.predict(seconds=10, seed=2).data
        b = self.predict(seconds=4, alpha=2, beta=12, seed=3).data
        self.assertAlmostEqual(a["p_fear_smoothed"], a["p_fear"])
        expected = (a["p_fear"] * a["n_windows"] + b["p_fear"] * b["n_windows"]) / (a["n_windows"] + b["n_windows"])
        self.assertAlmostEqual(b["p_fear_smoothed"], expected)

    def test_eeg_only_without_motion(self):
        r = self.calibrate(motion=False)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertFalse(r.data["has_motion"])
        r = self.predict(motion=False)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertFalse(r.data["motion_used"])

    def test_channel_major_eeg_is_accepted(self):
        self.calibrate()
        body = recording(4)
        body["eeg"] = np.array(body["eeg"]).T.tolist()     # [[TP9...], [AF7...], [AF8...], [TP10...]]
        r = self.client.post("/api/inference/predict/", body, format="json")
        self.assertEqual(r.status_code, 200, r.data)

    def test_bad_input_is_rejected(self):
        self.calibrate()
        cases = {
            "too short": recording(2),
            "3 channels": {**recording(4), "eeg": [row[:3] for row in recording(4)["eeg"]]},
            "nan": {**recording(4), "eeg": [[None, 1, 2, 3]] + recording(4)["eeg"]},
            "gyro without acc": {k: v for k, v in recording(4).items() if k != "acc"},
            "not an array": {"eeg": "hello"},
        }
        for name, body in cases.items():
            with self.subTest(name):
                r = self.client.post("/api/inference/predict/", body, format="json")
                self.assertEqual(r.status_code, 400, r.data)

    def test_calibration_must_be_at_least_30_seconds(self):
        r = self.client.post("/api/inference/calibrate/", recording(20), format="json")
        self.assertEqual(r.status_code, 400, r.data)

    def test_history_is_per_user(self):
        self.calibrate()
        self.predict()
        self.assertEqual(len(self.client.get("/api/inference/predictions/").data), 1)
        other = User.objects.create_user(email="other@example.com", password="pass-12345")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=other).key}")
        self.assertEqual(self.client.get("/api/inference/predictions/").data, [])
        self.assertEqual(self.predict().status_code, 409)   # other user has no calibration
        self.assertEqual(Prediction.objects.filter(user=other).count(), 0)

    def test_requires_authentication(self):
        self.client.credentials()
        for path in ("status/", "predictions/"):
            self.assertEqual(self.client.get(f"/api/inference/{path}").status_code, 401)
        for path in ("calibrate/", "predict/"):
            self.assertEqual(self.client.post(f"/api/inference/{path}", {}, format="json").status_code, 401)


class QuadrantTests(APITestCase):
    def test_quadrants(self):
        self.assertEqual(quadrant(-0.5, 0.5), "stressed")
        self.assertEqual(quadrant(0.5, 0.5), "excited")
        self.assertEqual(quadrant(0.5, -0.5), "relaxed")
        self.assertEqual(quadrant(-0.5, -0.5), "low")
