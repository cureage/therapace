from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    EEGSessionCreateSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .streaks import complete_eeg_session


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
