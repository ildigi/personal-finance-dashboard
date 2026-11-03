from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import limiter as limiter_module
from app.auth.service import (
    IDLE_DAYS,
    AuthError,
    open_session,
    resolve_session,
    setup_credentials,
)
from app.core.config import get_settings
from app.models import AuthCredential, AuthSession

PASSWORD = "FAKEPASSWORDTEST1"


@pytest.fixture(autouse=True)
def _fresh_limiter(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        limiter_module.limiter, "_failures", type(limiter_module.limiter._failures)()
    )


@pytest.fixture
def auth_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "auth_enabled", True)
    monkeypatch.setattr(get_settings(), "auth_cookie_secure", False)  # client di test in http
    return


@pytest.fixture
def totp(db: Session) -> pyotp.TOTP:
    enrollment = setup_credentials(db, PASSWORD)
    db.commit()
    return pyotp.TOTP(enrollment.secret)


def test_local_default_is_open(client: TestClient) -> None:
    assert client.get("/api/accounts").status_code == 200
    assert client.get("/api/auth/status").json() == {
        "enabled": False,
        "configured": False,
        "authenticated": True,
    }


def test_enabled_but_not_configured_blocks_everything(client: TestClient, auth_on: None) -> None:
    response = client.get("/api/accounts")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "auth.not_configured_setup"
    assert client.get("/api/health").status_code == 200  # lo stato resta visibile
    assert client.get("/api/auth/status").json()["configured"] is False


def test_login_logout_and_protected_api(
    client: TestClient, auth_on: None, totp: pyotp.TOTP, db: Session
) -> None:
    assert client.get("/api/accounts").status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"password": "sbagliata!!!!", "code": totp.now()}
        ).status_code
        == 401
    )
    assert (
        client.post("/api/auth/login", json={"password": PASSWORD, "code": "000000"}).status_code
        == 401
    )

    ok = client.post("/api/auth/login", json={"password": PASSWORD, "code": totp.now()})
    assert ok.status_code == 204
    cookie = ok.headers["set-cookie"]
    assert "fd_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert client.get("/api/accounts").status_code == 200
    assert client.get("/api/auth/status").json()["authenticated"] is True
    # Nel DB c'è solo l'hash del token, mai il token.
    stored = db.scalar(select(AuthSession))
    assert stored is not None
    assert client.cookies["fd_session"] not in stored.token_hash

    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/accounts").status_code == 401


def test_a_code_works_only_once(client: TestClient, auth_on: None, totp: pyotp.TOTP) -> None:
    code = totp.now()
    assert (
        client.post("/api/auth/login", json={"password": PASSWORD, "code": code}).status_code == 204
    )
    client.cookies.clear()
    again = client.post("/api/auth/login", json={"password": PASSWORD, "code": code})
    assert again.status_code == 401


def test_too_many_failures_lock_the_login(
    client: TestClient, auth_on: None, totp: pyotp.TOTP
) -> None:
    for _ in range(limiter_module.MAX_FAILURES):
        client.post("/api/auth/login", json={"password": "sbagliata!!!!", "code": "123456"})
    locked = client.post("/api/auth/login", json={"password": PASSWORD, "code": totp.now()})
    assert locked.status_code == 429
    assert int(locked.headers["retry-after"]) > 0


def test_requests_from_other_sites_are_refused(
    client: TestClient, auth_on: None, totp: pyotp.TOTP
) -> None:
    client.post("/api/auth/login", json={"password": PASSWORD, "code": totp.now()})
    evil = client.post(
        "/api/accounts",
        json={"name": "x"},
        headers={"Origin": "https://sito-malevolo.example"},
    )
    assert evil.status_code == 403


def test_idle_sessions_expire(db: Session, totp: pyotp.TOTP) -> None:
    now = datetime(2026, 10, 6, 12, tzinfo=UTC)
    issued = open_session(db, "Test", now=now)
    assert resolve_session(db, issued, now=now + timedelta(days=IDLE_DAYS - 1)) is not None
    later = now + timedelta(days=IDLE_DAYS - 1) + timedelta(days=IDLE_DAYS)
    assert resolve_session(db, issued, now=later) is None
    assert db.scalar(select(AuthSession)) is None  # eliminata


def test_password_rules_and_reset_closes_sessions(db: Session) -> None:
    with pytest.raises(AuthError):
        setup_credentials(db, "corta")
    setup_credentials(db, PASSWORD)
    open_session(db, "Test")
    setup_credentials(db, PASSWORD + "2")
    assert len(db.scalars(select(AuthCredential)).all()) == 1
    assert db.scalar(select(AuthSession)) is None
    stored = db.scalar(select(AuthCredential))
    assert stored is not None
    assert PASSWORD not in stored.password_hash


def test_security_headers(client: TestClient) -> None:
    response = client.get("/api/accounts")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
