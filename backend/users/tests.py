from datetime import datetime, timedelta, timezone as datetime_timezone
from unittest.mock import patch

from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from backend.asgi import application
from users.models import User


SENSOR_PAYLOAD = {
    "timestamp": "2026-11-07T21:00:00Z",
    "device_id": "muse-1234",
    "sensor_values": {"eeg": [12.4, 13.1, 11.8], "accelerometer": {"x": 0.1}},
    "battery_level": 87.5,
}


class SensorIngestViewTests(APITestCase):
    def setUp(self):
        user = User.objects.create_user(email="sensor@example.com", password="test-pass-123")
        self.token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def test_valid_payload_is_logged_and_accepted(self):
        with self.assertLogs("sensor_stream", level="INFO") as captured:
            response = self.client.post("/api/sensors/", SENSOR_PAYLOAD, format="json")

        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.data["accepted"])
        self.assertIn('"device_id": "muse-1234"', captured.output[0])

    def test_invalid_battery_level_is_rejected(self):
        payload = {**SENSOR_PAYLOAD, "battery_level": 120}

        response = self.client.post("/api/sensors/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("battery_level", response.data)

    def test_non_object_payload_is_rejected(self):
        response = self.client.post("/api/sensors/", [SENSOR_PAYLOAD], format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("non_field_errors", response.data)


class SensorWebSocketTests(TransactionTestCase):
    reset_sequences = True

    def test_authenticated_client_receives_status_and_sensor_ack(self):
        user = User.objects.create_user(email="ws@example.com", password="test-pass-123")
        token = Token.objects.create(user=user)

        async_to_sync(self._exercise_websocket)(token.key)

    async def _exercise_websocket(self, token_key):
        communicator = WebsocketCommunicator(
            application,
            "/ws/sensors/",
            headers=[(b"authorization", f"Token {token_key}".encode("ascii"))],
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        status_message = await communicator.receive_json_from()
        self.assertEqual(status_message["type"], "status")
        self.assertEqual(status_message["commands"], [])

        await communicator.send_json_to(SENSOR_PAYLOAD)
        acknowledgement = await communicator.receive_json_from()
        self.assertEqual(acknowledgement["type"], "sensor_received")
        self.assertEqual(acknowledgement["received_payloads"], 1)
        await communicator.disconnect()

    def test_anonymous_client_is_rejected(self):
        async_to_sync(self._exercise_anonymous_websocket)()

    async def _exercise_anonymous_websocket(self):
        communicator = WebsocketCommunicator(application, "/ws/sensors/")
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4401)


class EEGSessionStreakTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="streak@example.com", password="SafePass123!")
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def post_session_at(self, completed_at):
        with patch("users.streaks.timezone.now", return_value=completed_at):
            return self.client.post(
                "/api/sessions/",
                {"session_data": {"duration_seconds": 300}},
                format="json",
            )

    def test_completed_session_records_daily_streak_and_returns_user_stats(self):
        completed_at = datetime(2026, 11, 6, 23, 30, tzinfo=datetime_timezone.utc)

        response = self.post_session_at(completed_at)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["streak"], 1)
        self.assertEqual(response.data["user"]["max_streak"], 1)
        self.assertEqual(response.data["user"]["last_activity_date"], "2026-11-06")
        self.assertEqual(self.user.eeg_sessions.count(), 1)

    def test_multiple_sessions_on_one_day_count_as_one_streak_day(self):
        completed_at = datetime(2026, 11, 6, 12, 0, tzinfo=datetime_timezone.utc)

        self.post_session_at(completed_at)
        response = self.post_session_at(completed_at.replace(hour=18))

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["streak"], 1)
        self.assertEqual(self.user.streak_days.count(), 1)
        self.assertEqual(self.user.eeg_sessions.count(), 2)

    def test_consecutive_days_extend_streak_and_a_gap_starts_a_new_one(self):
        first_day = datetime(2026, 11, 6, 12, 0, tzinfo=datetime_timezone.utc)
        self.post_session_at(first_day)
        second_response = self.post_session_at(first_day + timedelta(days=1))
        third_response = self.post_session_at(first_day + timedelta(days=3))

        self.assertEqual(second_response.data["user"]["streak"], 2)
        self.assertEqual(second_response.data["user"]["max_streak"], 2)
        self.assertEqual(third_response.data["user"]["streak"], 1)
        self.assertEqual(third_response.data["user"]["max_streak"], 2)

    def test_sessions_across_utc_midnight_count_as_consecutive_days(self):
        first_response = self.post_session_at(
            datetime(2026, 11, 6, 23, 59, tzinfo=datetime_timezone.utc)
        )
        second_response = self.post_session_at(
            datetime(2026, 11, 7, 0, 1, tzinfo=datetime_timezone.utc)
        )

        self.assertEqual(first_response.data["user"]["streak"], 1)
        self.assertEqual(second_response.data["user"]["streak"], 2)

    def test_expired_current_streak_is_reported_as_zero(self):
        self.user.streak = 4
        self.user.max_streak = 4
        self.user.last_activity_date = datetime(2026, 11, 5).date()
        self.user.save()
        today = datetime(2026, 11, 7, 12, 0, tzinfo=datetime_timezone.utc)

        with patch("users.streaks.timezone.now", return_value=today):
            response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["streak"], 0)
        self.assertEqual(response.data["max_streak"], 4)

    def test_non_object_session_data_is_rejected(self):
        response = self.client.post(
            "/api/sessions/",
            {"session_data": ["not", "an", "object"]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("session_data", response.data)

    def test_session_endpoint_requires_authentication(self):
        self.client.credentials()

        response = self.client.post(
            "/api/sessions/",
            {"session_data": {"duration_seconds": 300}},
            format="json",
        )

        self.assertEqual(response.status_code, 401)
