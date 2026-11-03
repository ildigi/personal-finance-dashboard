"""Accesso: stato, login con password + codice, uscita (SPEC §15)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select

from app.api.deps import DbSession
from app.auth.deps import COOKIE_NAME, check_origin, require_auth
from app.auth.limiter import limiter
from app.auth.service import (
    SESSION_DAYS,
    close_all_sessions,
    close_session,
    is_configured,
    open_session,
    resolve_session,
    verify_login,
)
from app.core.config import get_settings
from app.core.messages import http_error
from app.models import AuthSession
from app.schemas.auth import AuthStatus, LoginRequest, SessionRead

router = APIRouter(prefix="/auth", tags=["accesso"])


@router.get("/status", response_model=AuthStatus)
def auth_status(request: Request, session: DbSession) -> AuthStatus:
    enabled = get_settings().auth_enabled
    configured = is_configured(session)
    authenticated = not enabled or (
        configured and resolve_session(session, request.cookies.get(COOKIE_NAME)) is not None
    )
    session.commit()
    return AuthStatus(enabled=enabled, configured=configured, authenticated=authenticated)


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
def login(payload: LoginRequest, request: Request, session: DbSession) -> Response:
    check_origin(request)
    wait = limiter.retry_after()
    if wait:
        error = http_error(
            status.HTTP_429_TOO_MANY_REQUESTS, "auth.locked", minutes=max(1, wait // 60)
        )
        error.headers = {"Retry-After": str(wait)}
        raise error
    if not is_configured(session):
        raise http_error(status.HTTP_409_CONFLICT, "auth.not_configured")
    if not verify_login(session, payload.password, payload.code):
        session.commit()
        limiter.failure()
        raise http_error(status.HTTP_401_UNAUTHORIZED, "auth.invalid_credentials")
    limiter.success()
    issued = open_session(session, request.headers.get("user-agent"))
    session.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.set_cookie(
        COOKIE_NAME,
        issued,
        max_age=SESSION_DAYS * 86_400,
        httponly=True,
        secure=get_settings().auth_cookie_secure,
        samesite="strict",
        path="/",
    )
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, session: DbSession) -> Response:
    check_origin(request)
    close_session(session, request.cookies.get(COOKIE_NAME))
    session.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(request: Request, session: DbSession) -> Response:
    """Chiude le sessioni su tutti i dispositivi (anche questa)."""
    require_auth(request, session)
    close_all_sessions(session)
    session.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@router.get("/sessions", response_model=list[SessionRead])
def list_sessions(request: Request, session: DbSession) -> list[SessionRead]:
    require_auth(request, session)
    now = datetime.now(UTC)
    rows = session.scalars(
        select(AuthSession)
        .where(AuthSession.expires_at > now)
        .order_by(AuthSession.last_seen_at.desc())
    )
    return [
        SessionRead(
            created_at=r.created_at,
            last_seen_at=r.last_seen_at,
            expires_at=r.expires_at,
            user_agent=r.user_agent,
        )
        for r in rows
    ]
