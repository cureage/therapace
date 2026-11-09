from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AIVideo, Fear
from .serializers import (
    AIVideoSerializer, EEGSessionCreateSerializer, FearSerializer, GenerateVideoSerializer,
    LoginSerializer, RegisterSerializer, UserSerializer,
)
from .streaks import complete_eeg_session


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
        qs = fear.videos.order_by("intensity", "-created_at")
        return Response(AIVideoSerializer(qs, many=True).data)

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
        return Response(AIVideoSerializer(video).data)

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


class AIVideoViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/videos/ and /api/videos/{id}/ (the client polls this until status == ready)."""
    serializer_class = AIVideoSerializer

    def get_queryset(self):
        qs = AIVideo.objects.filter(fear__user=self.request.user).select_related("fear")
        # Optional filters: ?fear=3&status=ready
        if fear_id := self.request.query_params.get("fear"):
            qs = qs.filter(fear_id=fear_id)
        if status_param := self.request.query_params.get("status"):
            qs = qs.filter(status=status_param)
        return qs.order_by("-created_at")



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
            session_data=serializer.validated_data["session_data"],
        )
        return Response(
            {
                "id": session.pk,
                "created_at": session.created_at,
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )
