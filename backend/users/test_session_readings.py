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
