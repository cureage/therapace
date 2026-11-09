from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.urls import reverse
from rest_framework import serializers

from . import video_generation
from .models import AIVideo, EEGSession, Fear, User
from .streaks import current_streak


class AIVideoSerializer(serializers.ModelSerializer):
    fear_name = serializers.CharField(source="fear.name", read_only=True)
    stream_url = serializers.SerializerMethodField()

    class Meta:
        model = AIVideo
        fields = (
            "id", "fear", "fear_name", "intensity", "prompt", "provider", "status",
            "error_message", "video_url", "stream_url", "thumbnail_url", "duration_seconds",
            "clip_duration_seconds", "created_at",
        )
        read_only_fields = fields   # the backend manages videos, the client only reads them

    def get_stream_url(self, video):
        """Where the app streams a ready video from (send the usual Authorization header)."""
        if video.status != AIVideo.Status.READY or not video.video_file:
            return None
        path = reverse("video-stream", args=[video.pk])
        request = self.context.get("request")
        return request.build_absolute_uri(path) if request else path


class ExposureVideoRequestSerializer(serializers.Serializer):
    """Input for POST /api/videos/ from the conquer page."""
    fear = serializers.CharField(max_length=100)
    intensity = serializers.IntegerField(
        min_value=video_generation.MIN_INTENSITY, max_value=video_generation.MAX_INTENSITY,
    )
    duration_seconds = serializers.IntegerField(
        min_value=video_generation.MIN_DURATION_SECONDS,
        max_value=video_generation.MAX_DURATION_SECONDS,
    )
    request_key = serializers.CharField(max_length=64, required=False)

    def validate_fear(self, value):
        return " ".join(value.split())


class FearSerializer(serializers.ModelSerializer):
    video_count = serializers.IntegerField(source="videos.count", read_only=True)

    class Meta:
        model = Fear
        fields = (
            "id", "category", "name", "description", "initial_severity",
            "current_level", "is_active", "video_count", "created_at",
        )
        read_only_fields = ("id", "current_level", "video_count", "created_at")

    def validate_initial_severity(self, value):
        if value is not None and not 0 <= value <= 10:
            raise serializers.ValidationError("Must be between 0 and 10.")
        return value


class GenerateVideoSerializer(serializers.Serializer):
    """Input for POST /fears/{id}/generate-video/. Both fields are optional."""
    intensity = serializers.IntegerField(min_value=1, max_value=10, required=False)
    prompt = serializers.CharField(required=False, allow_blank=False)


class UserSerializer(serializers.ModelSerializer):
    streak = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "is_email_verified",
            "streak",
            "max_streak",
            "last_activity_date",
        )
        read_only_fields = fields

    def get_streak(self, user):
        return current_streak(user)


class EEGSessionCreateSerializer(serializers.Serializer):
    session_data = serializers.JSONField()
    status = serializers.ChoiceField(choices=EEGSession.Status.choices, default=EEGSession.Status.COMPLETE)
    recording_key = serializers.CharField(max_length=64, required=False)
    started_at = serializers.DateTimeField(required=False)
    ended_at = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        start, end = attrs.get("started_at"), attrs.get("ended_at")
        if (start is None) != (end is None) or (start is not None and end < start):
            raise serializers.ValidationError("Provide a start and end in chronological order.")
        return attrs

    def validate_session_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected a JSON object.")
        return value


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("email", "password", "first_name", "last_name")
        extra_kwargs = {
            "first_name": {"required": False},
            "last_name": {"required": False},
        }

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        # Run Django's password validators (length, common passwords, etc.)
        validate_password(attrs["password"], user=User(**{k: v for k, v in attrs.items() if k != "password"}))
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            email=attrs["email"].lower(),
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError("Invalid email or password.")
        attrs["user"] = user
        return attrs
