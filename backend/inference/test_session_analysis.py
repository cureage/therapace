from datetime import datetime, timedelta, timezone as dt_timezone

import numpy as np
from rest_framework.test import APITestCase

from users.models import EEGSession, SessionReading, User

from . import registry
from .models import Calibration
from .session_analysis import muse_frames

FS = 256
PACKET = 12  # samples per Muse packet
CHANNELS = ("TP9", "AF7", "AF8", "TP10")
T0 = datetime(2026, 11, 9, 12, 0, tzinfo=dt_timezone.utc)


def iso(moment):
    return moment.isoformat().replace("+00:00", "Z")


class SessionAnalysisTests(APITestCase):
    def setUp(self):
        self.assertTrue(registry.status()["model_loaded"], registry.status())
        self.user = User.objects.create_user(email="analysis@example.com", password="pass-12345")
        self.client.force_authenticate(self.user)

    def make_session(self, baseline_seconds=40, exposure_seconds=30, eeg=True, heart=True,
                     mark_exposure=True):
        exposure_start = T0 + timedelta(seconds=baseline_seconds)
        session = EEGSession.objects.create(
            user=self.user, started_at=T0,
            ended_at=exposure_start + timedelta(seconds=exposure_seconds),
            session_data={"fear": "Spiders",
                          **({"exposure_started_at": iso(exposure_start)} if mark_exposure else {})},
        )
        readings = []
        total = baseline_seconds + exposure_seconds
        if eeg:
            rng = np.random.default_rng(0)
            sequence = 0
            for frame in range(int(total * FS / PACKET)):
                t = (np.arange(PACKET) + frame * PACKET) / FS
                for k, channel in enumerate(CHANNELS):
                    samples = 10 * np.sin(2 * np.pi * 10 * t + k) + rng.normal(0, 5, PACKET)
                    readings.append(SessionReading(
                        session=session, type="eeg", device_id="muse",
                        timestamp=T0 + timedelta(seconds=frame * PACKET / FS), source_index=sequence + 1,
                        data={"unit": "uV", "sampling_rate_hz": FS, "sequence_id": sequence,
                              "channel": channel, "samples": samples.round(3).tolist()},
                    ))
                    sequence += 1
        if heart:
            readings += [
                SessionReading(session=session, type="heart_rate", device_id="fitbit",
                               timestamp=T0 + timedelta(seconds=s),
                               data={"unit": "bpm", "value": 70 if s < baseline_seconds else 85})
                for s in range(total)
            ]
        SessionReading.objects.bulk_create(readings)
        return session

    def analyze(self, session):
        return self.client.post(f"/api/sessions/{session.pk}/analysis/")

    def test_baseline_calibrates_the_model_and_the_video_is_scored_in_chunks(self):
        session = self.make_session()

        response = self.analyze(session)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data["baseline_seconds"], response.data["exposure_seconds"]), (40, 30))
        self.assertEqual(response.data["heart_rate"], {
            "baseline_bpm": 70.0, "exposure_mean_bpm": 85.0, "exposure_max_bpm": 85.0, "change_bpm": 15.0,
            "timeline": [{"seconds": float(s), "bpm": 85.0} for s in range(30)],
        })
        fear = response.data["fear"]
        calibration = Calibration.objects.get(eeg_session=session)
        self.assertEqual(fear["calibration_id"], calibration.pk)
        self.assertEqual(calibration.baseline_hr_mean, 70.0)
        self.assertAlmostEqual(calibration.duration_seconds, 40, delta=0.1)
        # 30 s of video in 8 s chunks; the 6 s remainder is long enough to score on its own.
        self.assertEqual(fear["n_predictions"], 4)
        for point, expected in zip(fear["timeline"], (0, 8, 16, 24)):  # chunks end on packet edges
            self.assertAlmostEqual(point["seconds"], expected, delta=0.15)
        self.assertTrue(all(0 <= point["p_fear"] <= 1 for point in fear["timeline"]))
        self.assertEqual(fear["timeline"][0]["heart_rate_bpm"], 85.0)
        self.assertEqual(response.data["notes"], [])

    def test_analysis_is_stored_and_rerunning_replaces_it(self):
        session = self.make_session()

        self.assertEqual(self.client.get(f"/api/sessions/{session.pk}/analysis/").status_code, 404)
        first = self.analyze(session)
        second = self.analyze(session)
        stored = self.client.get(f"/api/sessions/{session.pk}/analysis/")

        self.assertEqual(Calibration.objects.filter(eeg_session=session).count(), 1)
        self.assertNotEqual(first.data["fear"]["calibration_id"], second.data["fear"]["calibration_id"])
        self.assertEqual(stored.data, second.data)

    def test_a_short_baseline_still_reports_heart_rate(self):
        session = self.make_session(baseline_seconds=10)

        response = self.analyze(session)

        self.assertIsNone(response.data["fear"])
        self.assertIn("baseline had 10 s", response.data["notes"][0])
        self.assertEqual(response.data["heart_rate"]["change_bpm"], 15.0)
        self.assertFalse(Calibration.objects.exists())

    def test_sessions_without_sensors_explain_what_is_missing(self):
        response = self.analyze(self.make_session(eeg=False, heart=False))

        self.assertIsNone(response.data["heart_rate"])
        self.assertIsNone(response.data["fear"])
        self.assertEqual(len(response.data["notes"]), 2)

    def test_sessions_from_older_app_versions_treat_everything_as_the_video(self):
        response = self.analyze(self.make_session(mark_exposure=False))

        self.assertIsNone(response.data["baseline_seconds"])
        self.assertEqual(response.data["exposure_seconds"], 70)
        self.assertIsNone(response.data["heart_rate"]["change_bpm"])
        self.assertIsNone(response.data["fear"])

    def test_other_users_cannot_analyze_a_session(self):
        session = self.make_session(eeg=False)
        self.client.force_authenticate(User.objects.create_user(email="x@example.com", password="pass-12345"))

        self.assertEqual(self.analyze(session).status_code, 404)
        self.assertEqual(self.client.get(f"/api/sessions/{session.pk}/analysis/").status_code, 404)


class MuseFrameTests(APITestCase):
    def test_channel_packets_are_regrouped_and_incomplete_frames_dropped(self):
        def packet(seconds, sequence, channel, value):
            return SessionReading(type="eeg", device_id="muse", timestamp=T0 + timedelta(seconds=seconds),
                                  source_index=sequence + 1,
                                  data={"channel": channel, "samples": [value, value]})

        complete = [packet(0, n, channel, n) for n, channel in enumerate(CHANNELS)]
        missing_af8 = [packet(1, 4 + n, channel, 9) for n, channel in enumerate(("TP9", "AF7", "TP10"))]

        frames = muse_frames(missing_af8 + complete[::-1])

        self.assertEqual(len(frames), 1)
        self.assertEqual(frames[0][0], T0)
        np.testing.assert_array_equal(frames[0][1], [[0, 1, 2, 3], [0, 1, 2, 3]])
