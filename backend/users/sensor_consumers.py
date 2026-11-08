import asyncio

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from .sensor_logging import log_sensor_payload
from .sensor_serializers import SensorPayloadSerializer


class SensorStreamConsumer(AsyncJsonWebsocketConsumer):
    """Receive sensor samples and periodically send status to one connected app."""

    status_interval_seconds = 5

    async def connect(self) -> None:
        self.status_task: asyncio.Task[None] | None = None
        self.received_payloads = 0

        if not self.scope["user"].is_authenticated:
            await self.close(code=4401)
            return

        await self.accept()
        self.status_task = asyncio.create_task(self.send_status_updates())

    async def disconnect(self, close_code: int) -> None:
        if self.status_task is not None:
            self.status_task.cancel()
            try:
                await self.status_task
            except asyncio.CancelledError:
                pass

    async def receive_json(self, content, **kwargs) -> None:
        log_sensor_payload(content)
        if not isinstance(content, dict):
            await self.send_json(
                {
                    "type": "validation_error",
                    "errors": {"non_field_errors": ["Expected a JSON object."]},
                }
            )
            return

        serializer = SensorPayloadSerializer(data=content)
        if not serializer.is_valid():
            await self.send_json(
                {"type": "validation_error", "errors": serializer.errors}
            )
            return

        self.received_payloads += 1
        await self.send_json(
            {
                "type": "sensor_received",
                "device_id": serializer.validated_data["device_id"],
                "received_payloads": self.received_payloads,
            }
        )

    async def send_status_updates(self) -> None:
        while True:
            await self.send_json(
                {
                    "type": "status",
                    "status": "connected",
                    "server_time": timezone.now().isoformat(),
                    "received_payloads": self.received_payloads,
                    "commands": [],
                }
            )
            await asyncio.sleep(self.status_interval_seconds)
