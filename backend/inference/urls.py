from django.urls import path

from .views import CalibrateView, PredictionListView, PredictView, StatusView

urlpatterns = [
    path("status/", StatusView.as_view(), name="inference-status"),
    path("calibrate/", CalibrateView.as_view(), name="inference-calibrate"),
    path("predict/", PredictView.as_view(), name="inference-predict"),
    path("predictions/", PredictionListView.as_view(), name="inference-predictions"),
]
