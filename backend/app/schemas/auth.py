"""Accesso (SPEC §15)."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.common import ApiModel


class AuthStatus(ApiModel):
    enabled: bool = Field(description="Accesso richiesto (sul server); spento in locale")
    configured: bool = Field(description="Password e codice già impostati")
    authenticated: bool = Field(description="Questa richiesta ha una sessione valida")


class LoginRequest(ApiModel):
    password: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=6, max_length=10, description="Codice dell'app di autenticazione")


class SessionRead(ApiModel):
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    user_agent: str | None
