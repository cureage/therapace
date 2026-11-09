import csv
import io
from datetime import datetime, timedelta, timezone as dt_timezone

import numpy as np
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from users.models import User

from . import registry
from .affect import quadrant
from .models import Calibration, HeartRateSample, Prediction

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


T0 = datetime(2026, 11, 8, 20, 0, 0, tzinfo=dt_timezone.utc)


def hr_series(start_s, seconds, bpm_from, bpm_to):
    """1 Hz heart-rate readings, ramping linearly, starting start_s seconds after T0."""
    return [{"timestamp": (T0 + timedelta(seconds=start_s + i)).isoformat(),
             "bpm": round(bpm_from + (bpm_to - bpm_from) * i / max(seconds - 1, 1), 2)}
            for i in range(seconds)]


class HeartRateSessionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="hr@example.com", password="pass-12345")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.user).key}")

    def run_session(self, chunks=10):
        """60 s calibration at ~70 bpm, then `chunks` 4 s EEG chunks while HR climbs 75 -> 100 bpm."""
        body = {**recording(60), "started_at": T0.isoformat(), "hr": hr_series(0, 60, 69, 71)}
        r = self.client.post("/api/inference/calibrate/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        session_hr = hr_series(60, 4 * chunks, 75, 100)
        for k in range(chunks):
            body = {**recording(4, alpha=10 - 0.7 * k, beta=3 + k, seed=k + 1),
                    "started_at": (T0 + timedelta(seconds=60 + 4 * k)).isoformat(),
                    "hr": session_hr[4 * k:4 * k + 4]}
            r = self.client.post("/api/inference/predict/", body, format="json")
            self.assertEqual(r.status_code, 200, r.data)
        return Calibration.objects.get(user=self.user), r.data

    def test_calibration_sets_hr_baseline(self):
        calib, last = self.run_session(chunks=1)
        self.assertAlmostEqual(calib.baseline_hr_mean, 70, places=1)
        self.assertEqual(calib.recorded_at, T0)
        self.assertEqual(calib.heart_rate.filter(is_baseline=True).count(), 60)

    def test_prediction_compares_hr_with_baseline(self):
        _, last = self.run_session(chunks=10)
        self.assertEqual(last["recorded_at"], (T0 + timedelta(seconds=96)).isoformat().replace("+00:00", "Z"))
        self.assertGreater(last["hr_mean"], 95)
        self.assertAlmostEqual(last["hr_delta"], last["hr_mean"] - 70, delta=0.2)

    def test_hr_sent_separately_is_matched_to_prediction(self):
        self.client.post("/api/inference/calibrate/", {**recording(60), "started_at": T0.isoformat()}, format="json")
        r = self.client.post("/api/inference/heart-rate/", {"samples": hr_series(0, 60, 60, 60), "baseline": True},
                             format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["baseline_hr_mean"], 60)
        self.client.post("/api/inference/heart-rate/", {"samples": hr_series(60, 4, 90, 90)}, format="json")
        r = self.client.post("/api/inference/predict/",
                             {**recording(4), "started_at": (T0 + timedelta(seconds=60)).isoformat()}, format="json")
        self.assertEqual((r.data["hr_mean"], r.data["hr_delta"]), (90, 30))

    def test_resent_hr_samples_are_not_duplicated(self):
        self.client.post("/api/inference/calibrate/", recording(60), format="json")
        for _ in range(2):
            self.client.post("/api/inference/heart-rate/", {"samples": hr_series(0, 5, 80, 80)}, format="json")
        self.assertEqual(HeartRateSample.objects.count(), 5)

    def test_heart_rate_validation(self):
        self.assertEqual(self.client.post("/api/inference/heart-rate/", {"samples": hr_series(0, 1, 80, 80)},
                                          format="json").status_code, 409)   # no session yet
        self.client.post("/api/inference/calibrate/", recording(60), format="json")
        for bad in ({"samples": []}, {"samples": [{"timestamp": T0.isoformat(), "bpm": 400}]},
                    {"samples": [{"bpm": 80}]}):
            with self.subTest(bad):
                self.assertEqual(self.client.post("/api/inference/heart-rate/", bad, format="json").status_code, 400)

    def test_session_report(self):
        calib, _ = self.run_session(chunks=10)
        r = self.client.get("/api/inference/sessions/latest/")
        self.assertEqual(r.status_code, 200, r.data)
        hr = r.data["heart_rate"]
        self.assertEqual(r.data["session_id"], calib.pk)
        self.assertEqual((hr["n_baseline_samples"], hr["n_session_samples"]), (60, 40))
        self.assertAlmostEqual(hr["session_mean_bpm"], 87.5, places=1)
        self.assertAlmostEqual(hr["mean_delta_bpm"], 17.5, delta=0.2)
        self.assertAlmostEqual(hr["max_delta_bpm"], 30, delta=0.2)
        self.assertAlmostEqual(hr["elevated_threshold_bpm"], 75, delta=0.1)   # baseline + 5 bpm (2 SD is smaller)
        self.assertEqual(hr["pct_samples_elevated"], 97.5)   # 39/40: the first reading is exactly 75.0
        self.assertEqual(r.data["fear"]["n_predictions"], 10)
        self.assertAlmostEqual(r.data["duration_seconds"], 99)
        self.assertEqual(self.client.get(f"/api/inference/sessions/{calib.pk}/").data["session_id"], calib.pk)
        self.assertEqual(len(self.client.get("/api/inference/sessions/").data), 1)

    def test_csv_export(self):
        self.run_session(chunks=3)
        r = self.client.get("/api/inference/sessions/latest/export.csv")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "text/csv; charset=utf-8")
        rows = list(csv.DictReader(io.StringIO(r.content.decode())))
        kinds = [row["kind"] for row in rows]
        self.assertEqual((kinds.count("hr_baseline"), kinds.count("hr"), kinds.count("prediction")), (60, 12, 3))
        secs = [float(row["seconds"]) for row in rows]
        self.assertEqual(secs, sorted(secs))
        first_hr = next(row for row in rows if row["kind"] == "hr")
        self.assertEqual(float(first_hr["seconds"]), 60)
        self.assertAlmostEqual(float(first_hr["hr_delta_bpm"]), 5, delta=0.2)

    def test_chart_png(self):
        self.run_session(chunks=10)
        r = self.client.get("/api/inference/sessions/latest/chart.png")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "image/png")
        self.assertTrue(r.content.startswith(b"\x89PNG"))

    def test_empty_and_foreign_sessions(self):
        self.assertEqual(self.client.get("/api/inference/sessions/latest/").status_code, 404)
        self.client.post("/api/inference/calibrate/", recording(60), format="json")
        self.assertEqual(self.client.get("/api/inference/sessions/latest/chart.png").status_code, 404)  # no data yet
        calib = Calibration.objects.get(user=self.user)
        other = User.objects.create_user(email="other-hr@example.com", password="pass-12345")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=other).key}")
        for suffix in ("", "export.csv", "chart.png"):
            self.assertEqual(self.client.get(f"/api/inference/sessions/{calib.pk}/{suffix}").status_code, 404)


class QuadrantTests(APITestCase):
    def test_quadrants(self):
        self.assertEqual(quadrant(-0.5, 0.5), "stressed")
        self.assertEqual(quadrant(0.5, 0.5), "excited")
        self.assertEqual(quadrant(0.5, -0.5), "relaxed")
        self.assertEqual(quadrant(-0.5, -0.5), "low")
