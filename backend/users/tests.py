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
