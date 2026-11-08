from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .sensor_logging import log_sensor_payload
from .sensor_serializers import SensorPayloadSerializer


class SensorIngestView(APIView):
    """Accept and validate a single sensor sample over HTTP."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = request.data
        log_sensor_payload(payload)
        if not isinstance(payload, dict):
            return Response(
                {"non_field_errors": ["Expected a JSON object."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SensorPayloadSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        return Response(
            {"accepted": True, "data": serializer.data},
            status=status.HTTP_202_ACCEPTED,
        )
