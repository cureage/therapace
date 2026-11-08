"""Append timestamped sensor batches and retrieve a session's graph data."""
import math

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import EEGSession, SessionReading


class HeartRateSampleSerializer(serializers.Serializer):
    timestamp = serializers.DateTimeField()
    value = serializers.IntegerField(min_value=1, max_value=65535)


class EEGSampleSerializer(serializers.Serializer):
    timestamp = serializers.DateTimeField()
    channels = serializers.DictField(
        child=serializers.FloatField(), allow_empty=False,
    )

    def validate_channels(self, channels):
        if len(channels) > 32:
            raise serializers.ValidationError("Provide at most 32 channels per sample.")
        if any(not math.isfinite(value) for value in channels.values()):
            raise serializers.ValidationError("Channel values must be finite numbers.")
        return channels


class SessionBatchSerializer(serializers.Serializer):
    session_id = serializers.IntegerField(min_value=1)
    type = serializers.ChoiceField(choices=SessionReading.Type.choices)
    device_id = serializers.CharField(max_length=255)
    data = serializers.DictField()

    def validate(self, attrs):
        data = attrs["data"]
        expected_unit = "bpm" if attrs["type"] == SessionReading.Type.HEART_RATE else "uV"
        if data.get("unit") != expected_unit:
            raise serializers.ValidationError({"data": {"unit": f"Expected {expected_unit}."}})
        samples = data.get("samples")
        if not isinstance(samples, list) or not 1 <= len(samples) <= 1000:
            raise serializers.ValidationError({"data": {"samples": "Provide 1 to 1000 timestamped samples."}})
        sample_class = HeartRateSampleSerializer if expected_unit == "bpm" else EEGSampleSerializer
        serializer = sample_class(data=samples, many=True)
        if not serializer.is_valid():
            raise serializers.ValidationError({"data": {"samples": serializer.errors}})
        attrs["data"] = {"unit": expected_unit, "samples": serializer.validated_data}
        return attrs


class SessionReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionReading
        fields = ["id", "session_id", "type", "device_id", "timestamp", "data", "received_at"]
        read_only_fields = fields


class ReadingPagination(LimitOffsetPagination):
    default_limit = 1000
    max_limit = 1000


class SessionReadingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get_session(self, request, pk):
        return get_object_or_404(EEGSession, pk=pk, user=request.user)

    def post(self, request, pk):
        session = self.get_session(request, pk)
        serializer = SessionBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        batch = serializer.validated_data
        if batch["session_id"] != session.pk:
            raise serializers.ValidationError({"session_id": "Must match the session in the URL."})
        samples = batch["data"]["samples"]
        readings = [SessionReading(
            session=session,
            type=batch["type"],
            device_id=batch["device_id"],
            timestamp=sample["timestamp"],
            data={"unit": batch["data"]["unit"], **{
                key: value for key, value in sample.items() if key != "timestamp"
            }},
        ) for sample in samples]
        with transaction.atomic():
            # Retry-safe: the first sample for a device/type/timestamp is retained.
            SessionReading.objects.bulk_create(readings, ignore_conflicts=True)
        return Response({
            "session_id": session.pk,
            "accepted_samples": len(samples),
            "detail": "Samples saved; previously received timestamps are retained unchanged.",
        }, status=status.HTTP_200_OK)

    def get(self, request, pk):
        session = self.get_session(request, pk)
        readings = session.readings.all()
        reading_type = request.query_params.get("type")
        if reading_type:
            if reading_type not in SessionReading.Type.values:
                raise serializers.ValidationError({"type": "Expected eeg or heart_rate."})
            readings = readings.filter(type=reading_type)
        pagination = ReadingPagination()
        page = pagination.paginate_queryset(readings, request, view=self)
        return pagination.get_paginated_response(SessionReadingSerializer(page, many=True).data)
