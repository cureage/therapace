from django.urls import path

from users.sensor_consumers import SensorStreamConsumer

websocket_urlpatterns = [
    path("ws/sensors/", SensorStreamConsumer.as_asgi()),
]
