from django.urls import path

from .views import (
    CalibrateView, HeartRateView, PredictionListView, PredictView, SessionChartView, SessionCSVView,
    SessionListView, SessionReportView, StatusView,
)

urlpatterns = [
    path("status/", StatusView.as_view(), name="inference-status"),
    path("calibrate/", CalibrateView.as_view(), name="inference-calibrate"),
    path("predict/", PredictView.as_view(), name="inference-predict"),
    path("heart-rate/", HeartRateView.as_view(), name="inference-heart-rate"),
    path("predictions/", PredictionListView.as_view(), name="inference-predictions"),
    # a session = one calibration + everything recorded after it; <ref> is its id or "latest"
    path("sessions/", SessionListView.as_view(), name="inference-sessions"),
    path("sessions/<str:ref>/", SessionReportView.as_view(), name="inference-session-report"),
    path("sessions/<str:ref>/export.csv", SessionCSVView.as_view(), name="inference-session-csv"),
    path("sessions/<str:ref>/chart.png", SessionChartView.as_view(), name="inference-session-chart"),
]
