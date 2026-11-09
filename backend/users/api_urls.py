from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AIVideoViewSet, FearViewSet, LeaderboardView

router = DefaultRouter()
router.register("fears", FearViewSet, basename="fear")
router.register("videos", AIVideoViewSet, basename="video")

urlpatterns = [
    path("leaderboard/", LeaderboardView.as_view(), name="leaderboard"),
    *router.urls,
]
