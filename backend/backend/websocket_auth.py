from typing import Any, Awaitable, Callable, MutableMapping, TypeAlias

from channels.db import database_sync_to_async
from django.contrib.auth.models import AbstractBaseUser, AnonymousUser
from rest_framework.authtoken.models import Token

ASGIMessage: TypeAlias = MutableMapping[str, Any]
ASGIScope: TypeAlias = MutableMapping[str, Any]
ASGIReceive: TypeAlias = Callable[[], Awaitable[ASGIMessage]]
ASGISend: TypeAlias = Callable[[ASGIMessage], Awaitable[None]]
ASGIApp: TypeAlias = Callable[[ASGIScope, ASGIReceive, ASGISend], Awaitable[None]]


class DRFTokenAuthMiddleware:
    """Authenticate WebSocket clients with the project's DRF Token header."""

    def __init__(self, inner: ASGIApp) -> None:
        self.inner = inner

    async def __call__(
        self, scope: ASGIScope, receive: ASGIReceive, send: ASGISend
    ) -> None:
        user = scope.get("user")
        authorization = dict(scope.get("headers", [])).get(b"authorization", b"")
        scheme, separator, token_key = authorization.decode("latin1").partition(" ")

        if (
            user is not None
            and not user.is_authenticated
            and separator
            and scheme.lower() == "token"
            and token_key
        ):
            updated_scope = dict(scope)
            updated_scope["user"] = await self.get_user(token_key)
            scope = updated_scope

        await self.inner(scope, receive, send)

    @database_sync_to_async
    def get_user(self, token_key: str) -> AbstractBaseUser | AnonymousUser:
        try:
            return Token.objects.select_related("user").get(key=token_key).user
        except Token.DoesNotExist:
            return AnonymousUser()
