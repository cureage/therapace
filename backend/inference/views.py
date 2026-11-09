from django.http import Http404, HttpResponse
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import conf, registry, report, services
from .fearml.features import CHANNELS
from .models import Calibration, Prediction
from .serializers import (
    CalibrateInputSerializer, CalibrationSerializer, HeartRateInputSerializer, PredictInputSerializer,
    PredictionSerializer,
)


def _unavailable(exc):
    return Response({"detail": "Fear model is not loaded on the server.", "error": str(exc)},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE)


class _EEGView(APIView):
    input_serializer = None

    def parse(self, request):
        det = registry.get_detector()
        s = self.input_serializer(data=request.data, context={"detector": det})
        s.is_valid(raise_exception=True)
        return s.validated_data


class CalibrateView(_EEGView):
    """POST /api/inference/calibrate/: ~60 s of the user sitting calmly. Do this at the start of each session."""
    input_serializer = CalibrateInputSerializer

    def post(self, request):
        try:
            d = self.parse(request)
            calib = services.calibrate(request.user, d["eeg"], d["fs"], d.get("gyro"), d.get("acc"),
                                       started_at=d.get("started_at"), hr=d.get("hr"))
        except registry.ModelUnavailable as exc:
            return _unavailable(exc)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(CalibrationSerializer(calib).data, status=status.HTTP_201_CREATED)


class PredictView(_EEGView):
    """POST /api/inference/predict/: one chunk of EEG (>= 4 s; e.g. every 4 s, or 10-30 s batches)."""
    input_serializer = PredictInputSerializer

    def post(self, request):
        try:
            d = self.parse(request)
            pred = services.predict(request.user, d["eeg"], d["fs"], d.get("gyro"), d.get("acc"),
                                    started_at=d.get("started_at"), hr=d.get("hr"))
        except registry.ModelUnavailable as exc:
            return _unavailable(exc)
        except services.NoCalibration as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PredictionSerializer(pred).data, status=status.HTTP_200_OK)


class StatusView(APIView):
    """GET /api/inference/status/: what the server expects, and whether this user is calibrated."""

    def get(self, request):
        body = registry.status()
        try:
            det = registry.get_detector()
        except registry.ModelUnavailable:
            return Response(body, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        calib = services.latest_calibration(request.user)
        body.update({
            "window_seconds": det.win_s,
            "channels": CHANNELS,
            "default_sample_rate": conf.get("DEFAULT_SAMPLE_RATE"),
            "uses_motion": det.uses_motion,
            "fear_threshold": conf.get("FEAR_THRESHOLD"),
            "smoothing_seconds": conf.get("SMOOTHING_SECONDS"),
            "min_calibration_seconds": max(conf.get("MIN_CALIBRATION_SECONDS"), det.win_s),
            "calibration": CalibrationSerializer(calib).data if calib else None,
        })
        return Response(body)


class HeartRateView(APIView):
    """POST /api/inference/heart-rate/: heart-rate readings on their own, added to the current session.

    {"samples": [{"timestamp": "...", "bpm": 72}, ...], "baseline": false}
    Use "baseline": true for readings taken during the calm calibration (if they weren't sent with /calibrate/).
    """

    def post(self, request):
        s = HeartRateInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            calib = services.require_calibration(request.user)
        except services.NoCalibration as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        n = services.add_heart_rate(calib, s.validated_data["samples"], baseline=s.validated_data["baseline"])
        calib.refresh_from_db()
        return Response({"session_id": calib.pk, "received": n, "baseline_hr_mean": calib.baseline_hr_mean},
                        status=status.HTTP_201_CREATED)


def _session(request, ref):
    """ref is a calibration id or 'latest'."""
    qs = Calibration.objects.filter(user=request.user)
    calib = qs.order_by("-created_at").first() if ref == "latest" else qs.filter(pk=ref).first() if ref.isdigit() else None
    if calib is None:
        raise Http404("No such session.")
    return calib


class SessionListView(generics.ListAPIView):
    """GET /api/inference/sessions/: this user's sessions (one per calibration), newest first."""
    serializer_class = CalibrationSerializer

    def get_queryset(self):
        return Calibration.objects.filter(user=self.request.user).order_by("-created_at")


class SessionReportView(APIView):
    """GET /api/inference/sessions/<id|latest>/: heart rate vs baseline, fear and affect summary."""

    def get(self, request, ref):
        return Response(report.summary(_session(request, ref)))


class SessionCSVView(APIView):
    """GET /api/inference/sessions/<id|latest>/export.csv: every HR sample and prediction on one timeline."""

    def get(self, request, ref):
        calib = _session(request, ref)
        resp = HttpResponse(report.csv_text(calib), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="session_{calib.pk}.csv"'
        return resp


class SessionChartView(APIView):
    """GET /api/inference/sessions/<id|latest>/chart.png: heart rate, P(fear) and valence/arousal over time."""

    def get(self, request, ref):
        calib = _session(request, ref)
        png = report.chart_png(calib)
        if png is None:
            return Response({"detail": "Nothing to chart yet: no heart rate or predictions in this session."},
                            status=status.HTTP_404_NOT_FOUND)
        resp = HttpResponse(png, content_type="image/png")
        resp["Content-Disposition"] = f'inline; filename="session_{calib.pk}.png"'
        return resp


class PredictionListView(generics.ListAPIView):
    """GET /api/inference/predictions/?limit=100: this user's recent predictions, newest first."""
    serializer_class = PredictionSerializer

    def get_queryset(self):
        try:
            limit = min(max(int(self.request.query_params.get("limit", 100)), 1), 1000)
        except ValueError:
            limit = 100
        return Prediction.objects.filter(user=self.request.user).order_by("-created_at")[:limit]
