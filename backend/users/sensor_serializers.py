from rest_framework import serializers


class SensorPayloadSerializer(serializers.Serializer):
    """Validate a timestamped device sample with arbitrary nested sensor values."""

    timestamp = serializers.DateTimeField()
    device_id = serializers.CharField(max_length=255)
    sensor_values = serializers.DictField(child=serializers.JSONField())
    battery_level = serializers.FloatField(
        min_value=0,
        max_value=100,
        required=False,
    )
