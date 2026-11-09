import json

from rest_framework import renderers, status, viewsets
from rest_framework.decorators import action
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import video_generation
from .models import AIVideo, Fear
from .serializers import (
    AIVideoSerializer, EEGSessionCreateSerializer, ExposureVideoRequestSerializer, FearSerializer,
    GenerateVideoSerializer, LoginSerializer, RegisterSerializer, UserSerializer,
)
from .streaks import complete_eeg_session
from .streaming import ranged_file_response


def build_video_prompt(fear, intensity):
    """Placeholder prompt template. Tune this for your video provider."""
    return (
        f"A calm, realistic short video for gradual exposure therapy about {fear.get_category_display().lower()}. "
        f"Intensity {intensity} out of 10, where 1 is distant and harmless and 10 is close-up. "
        f"Context from the user: {fear.description or fear.name}."
    )


class FearViewSet(viewsets.ModelViewSet):
    serializer_class = FearSerializer

    def get_queryset(self):
        # Users only ever see their own fears
        return Fear.objects.filter(user=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["get"])
    def videos(self, request, pk=None):
        """GET /api/fears/{id}/videos/: this fear's videos, lowest intensity first."""
        fear = self.get_object()
        qs = fear.videos.select_related("fear").order_by("intensity", "-created_at")
        return Response(AIVideoSerializer(qs, many=True, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"], url_path="next-video")
    def next_video(self, request, pk=None):
        """GET /api/fears/{id}/next-video/: a ready video at the user's current level."""
        fear = self.get_object()
        video = (
            fear.videos.filter(status=AIVideo.Status.READY, intensity__lte=fear.current_level)
            .order_by("-intensity", "-created_at")
            .first()
        )
        if video is None:
            return Response(
                {"detail": "No ready video for this level yet. Generate one first."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(AIVideoSerializer(video, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="generate-video")
    def generate_video(self, request, pk=None):
        """POST /api/fears/{id}/generate-video/: queue a new AI video."""
        fear = self.get_object()
        serializer = GenerateVideoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        intensity = serializer.validated_data.get("intensity", fear.current_level)
        prompt = serializer.validated_data.get("prompt") or build_video_prompt(fear, intensity)

        video = AIVideo.objects.create(fear=fear, intensity=intensity, prompt=prompt)
        # TODO: call the video provider here (in a background thread) and update
        # video.status / video_url / external_job_id when it finishes.

        return Response(AIVideoSerializer(video).data, status=status.HTTP_202_ACCEPTED)


class VideoStreamRenderer(renderers.BaseRenderer):
    """Lets players that send `Accept: video/*` reach the stream action (errors render as JSON)."""
    media_type = "video/mp4"
    format = "mp4"
    charset = None
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return b"" if data is None else json.dumps(data).encode()


class AIVideoViewSet(viewsets.ReadOnlyModelViewSet):
    """Exposure videos.

    POST /api/videos/ {"fear", "intensity" (1-5), "duration_seconds" (3-60), "request_key"?}
        queues a Gemini generation and returns 202 with the video.
    GET /api/videos/ and /api/videos/{id}/: the client polls this until status == ready (or failed).
    GET /api/videos/{id}/stream/: the finished MP4, with HTTP Range support for streaming playback.
    """
    serializer_class = AIVideoSerializer
    throttle_scope = "video_generation"

    def get_throttles(self):
        # Only requesting a video costs money; polling and streaming are not limited.
        return [ScopedRateThrottle()] if self.action == "create" else []

    def get_queryset(self):
        qs = AIVideo.objects.filter(fear__user=self.request.user).select_related("fear")
        # Optional filters: ?fear=3&status=ready
        if fear_id := self.request.query_params.get("fear"):
            qs = qs.filter(fear_id=fear_id)
        if status_param := self.request.query_params.get("status"):
            qs = qs.filter(status=status_param)
        return qs.order_by("-created_at")

    def list(self, request, *args, **kwargs):
        video_generation.expire_stale_videos(request.user)
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        video_generation.expire_stale_videos(request.user)
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        serializer = ExposureVideoRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not video_generation.is_configured():
            return Response(
                {"detail": "Video generation is not configured on this server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        video = video_generation.request_video(user=request.user, **serializer.validated_data)
        return Response(self.get_serializer(video).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["get"], renderer_classes=[renderers.JSONRenderer, VideoStreamRenderer])
    def stream(self, request, pk=None, **kwargs):
        video = self.get_object()
        if video.status != AIVideo.Status.READY or not video.video_file:
            return Response({"detail": "This video is not ready yet."}, status=status.HTTP_409_CONFLICT)
        try:
            return ranged_file_response(request, video.video_file, "video/mp4")
        except FileNotFoundError:
            return Response({"detail": "The video file is missing."}, status=status.HTTP_404_NOT_FOUND)



class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class EEGSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = EEGSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session, user = complete_eeg_session(
            user=request.user,
            **serializer.validated_data,
        )
        return Response(
            {
                "id": session.pk,
                "created_at": session.created_at,
                "status": session.status,
                "started_at": session.started_at,
                "ended_at": session.ended_at,
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )
