from rest_framework.routers import DefaultRouter

from .views import AIVideoViewSet, FearViewSet

router = DefaultRouter()
router.register("fears", FearViewSet, basename="fear")
router.register("videos", AIVideoViewSet, basename="video")

urlpatterns = router.urls
