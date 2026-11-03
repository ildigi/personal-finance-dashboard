"""Protezione delle API quando l'accesso è attivo (`AUTH_ENABLED=true`, sul server)."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import Request, status

from app.api.deps import DbSession
from app.auth.service import is_configured, resolve_session
from app.core.config import get_settings
from app.core.messages import http_error

COOKIE_NAME = "fd_session"
_UNSAFE = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def check_origin(request: Request) -> None:
    """Le richieste che modificano dati devono partire dalla dashboard stessa (difesa in più
    oltre al cookie SameSite=Strict contro i siti che provano a farle a tuo nome)."""
    if request.method not in _UNSAFE:
        return
    origin = request.headers.get("origin")
    if origin is None:
        return
    allowed = set(get_settings().cors_origins)
    if origin in allowed or urlparse(origin).netloc == request.headers.get("host"):
        return
    raise http_error(status.HTTP_403_FORBIDDEN, "auth.foreign_origin")


def require_auth(request: Request, session: DbSession) -> None:
    if not get_settings().auth_enabled:
        return
    check_origin(request)
    if not is_configured(session):
        raise http_error(status.HTTP_503_SERVICE_UNAVAILABLE, "auth.not_configured_setup")
    found = resolve_session(session, request.cookies.get(COOKIE_NAME))
    session.commit()  # ultimo uso aggiornato o sessione scaduta eliminata
    if found is None:
        raise http_error(status.HTTP_401_UNAUTHORIZED, "auth.required")
