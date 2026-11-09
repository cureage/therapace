from django.utils import timezone
from rest_framework.test import APITestCase

from .models import EEGSession, SessionReading, User


class SessionReadingTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="reader@example.com", password="test-pass-123")
        self.client.force_authenticate(self.user)
        self.session = EEGSession.objects.create(user=self.user)
        self.url = f"/api/sessions/{self.session.pk}/readings/"
        self.payload = {
            "session_id": self.session.pk,
            "type": "heart_rate",
            "device_id": "fitbit-air",
            "data": {"unit": "bpm", "samples": [
                {"timestamp": "2026-11-08T19:30:01Z", "value": 72},
                {"timestamp": "2026-11-08T19:30:02Z", "value": 78},
            ]},
        }

    def test_batches_append_and_retries_do_not_duplicate(self):
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 200)
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 200)
        self.payload["data"]["samples"] = [{"timestamp": "2026-11-08T19:30:03Z", "value": 81}]
        self.client.post(self.url, self.payload, format="json")
        self.assertEqual(self.session.readings.count(), 3)
        readings = self.client.get(self.url + "?type=heart_rate&limit=2").data
        self.assertEqual(readings["count"], 3)
        self.assertIsNotNone(readings["next"])
        self.assertEqual([item["data"]["value"] for item in readings["results"]], [72, 78])
        self.assertTrue(timezone.is_aware(self.session.readings.first().timestamp))

    def test_eeg_and_heart_rate_share_a_session(self):
        self.client.post(self.url, self.payload, format="json")
        self.payload.update(type="eeg", device_id="muse")
        self.payload["data"] = {"unit": "uV", "samples": [
            {"timestamp": "2026-11-08T19:30:01.125Z", "channels": {"TP9": 12.4, "AF7": -8.2}},
        ]}
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 200)
        self.assertEqual(self.session.readings.count(), 3)
        self.assertEqual(self.client.get(self.url + "?type=eeg").data["count"], 1)

    def test_invalid_batch_does_not_partially_save(self):
        self.payload["data"]["samples"][1]["value"] = -1
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 400)
        self.assertFalse(SessionReading.objects.exists())

    def test_invalid_unit_empty_samples_and_session_mismatch(self):
        self.payload["data"]["unit"] = "uV"
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 400)
        self.payload["data"] = {"unit": "bpm", "samples": []}
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 400)
        self.payload["data"]["samples"] = [{"timestamp": "2026-11-08T19:30:01Z", "value": 72}]
        self.payload["session_id"] += 1
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 400)

    def test_other_users_cannot_read_or_append(self):
        other = User.objects.create_user(email="other@example.com", password="test-pass-123")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 404)

    def test_authentication_required(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 401)

    def test_partial_recording_creation_is_retry_safe_and_does_not_add_streak(self):
        payload = {
            "session_data": {"fear": "Spiders"},
            "recording_key": "partial-recording-1",
            "status": "partial",
            "started_at": "2026-11-08T19:30:00Z",
            "ended_at": "2026-11-08T19:30:05Z",
        }
        first = self.client.post("/api/sessions/", payload, format="json")
        retry = self.client.post("/api/sessions/", payload, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.data["id"], first.data["id"])
        self.assertEqual(first.data["status"], "partial")
        self.assertFalse(self.user.streak_days.exists())

    def test_eeg_packets_at_same_timestamp_keep_sequence_and_samples(self):
        timestamp = "2026-11-08T19:30:01.125Z"
        payload = {
            "session_id": self.session.pk,
            "type": "eeg",
            "device_id": "muse",
            "data": {"unit": "uV", "sampling_rate_hz": 256, "samples": [
                {"timestamp": timestamp, "sequence_id": 10, "channel": "TP9", "samples": [12.4, 10.1]},
                {"timestamp": timestamp, "sequence_id": 11, "channel": "AF7", "samples": [-8.2, -7.3]},
            ]},
        }
        for _ in range(2):
            self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 200)
        results = self.client.get(self.url + "?type=eeg").data["results"]
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["data"], {
            "unit": "uV", "sampling_rate_hz": 256, "sequence_id": 10, "channel": "TP9",
            "samples": [12.4, 10.1],
        })

    def test_full_size_eeg_batch_is_accepted_and_larger_ones_are_rejected(self):
        # Bloom uploads recordings in chunks of 1000 packets, the endpoint's limit.
        packets = [
            {"timestamp": "2026-11-08T19:30:01.125Z", "sequence_id": n,
             "channel": ["TP9", "AF7", "AF8", "TP10"][n % 4], "samples": [1.5] * 12}
            for n in range(1001)
        ]
        payload = {"session_id": self.session.pk, "type": "eeg", "device_id": "muse",
                   "data": {"unit": "uV", "sampling_rate_hz": 256, "samples": packets[:1000]}}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["accepted_samples"], 1000)
        self.assertEqual(self.session.readings.count(), 1000)

        payload["data"]["samples"] = packets
        self.assertEqual(self.client.post(self.url, payload, format="json").status_code, 400)

    def test_samples_outside_recording_window_are_rejected(self):
        self.session.started_at = timezone.datetime(2026, 11, 8, 19, 30, 2, tzinfo=timezone.utc)
        self.session.ended_at = timezone.datetime(2026, 11, 8, 19, 30, 5, tzinfo=timezone.utc)
        self.session.save()
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 400)
        self.assertFalse(self.session.readings.exists())
