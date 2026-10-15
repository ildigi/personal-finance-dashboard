"""Accesso a un solo utente: password (Argon2id) + codice TOTP (app di autenticazione).

- La password non viene mai salvata: solo il suo hash Argon2id.
- Il segreto TOTP è cifrato con la chiave dell'app (`app.key`), come i consensi bancari.
- Un codice TOTP vale una volta sola (si ricorda l'ultimo intervallo usato).
- La sessione è un token casuale nel cookie; nel DB c'è solo il suo hash SHA-256.
  Scade dopo `SESSION_DAYS` giorni, o dopo `IDLE_DAYS` giorni senza uso.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_json, encrypt_json
from app.models import AuthCredential, AuthSession

SESSION_DAYS = 30
IDLE_DAYS = 7
MIN_PASSWORD_LENGTH = 12
ISSUER = "Finanze"
#: Aggiorna `last_seen_at` al massimo ogni tanto: niente scrittura a ogni richiesta.
TOUCH_EVERY = timedelta(minutes=5)

_hasher = PasswordHasher()


class AuthError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(UTC)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def credentials(session: Session) -> AuthCredential | None:
    return session.scalar(select(AuthCredential).order_by(AuthCredential.id).limit(1))


def is_configured(session: Session) -> bool:
    return credentials(session) is not None


@dataclass(frozen=True)
class Enrollment:
    secret: str
    uri: str


def setup_credentials(session: Session, password: str, *, label: str = "dashboard") -> Enrollment:
    """Imposta (o sostituisce) password e segreto TOTP; chiude tutte le sessioni aperte."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AuthError(f"La password deve avere almeno {MIN_PASSWORD_LENGTH} caratteri")
    secret = pyotp.random_base32()
    session.execute(delete(AuthCredential))
    session.execute(delete(AuthSession))
    session.add(
        AuthCredential(
            password_hash=_hasher.hash(password),
            totp_secret_encrypted=encrypt_json({"totp": secret}),
            last_totp_step=None,
        )
    )
    session.flush()
    uri = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=ISSUER)
    return Enrollment(secret=secret, uri=uri)


def _totp(cred: AuthCredential) -> pyotp.TOTP:
    return pyotp.TOTP(str(decrypt_json(cred.totp_secret_encrypted)["totp"]))


def _matching_step(totp: pyotp.TOTP, code: str, now: datetime) -> int | None:
    """Intervallo da 30 s del codice (tollerato uno prima e uno dopo per l'orologio)."""
    code = code.strip().replace(" ", "")
    if not code.isdigit():
        return None
    current = totp.timecode(now)
    for step in (current - 1, current, current + 1):
        if secrets.compare_digest(totp.generate_otp(step), code):
            return step
    return None


def check_totp(session: Session, code: str, *, now: datetime | None = None) -> bool:
    """Solo il codice (es. per confermare la configurazione). Lo consuma se è giusto."""
    cred = credentials(session)
    if cred is None:
        return False
    step = _matching_step(_totp(cred), code, now or _now())
    if step is None or (cred.last_totp_step is not None and step <= cred.last_totp_step):
        return False
    cred.last_totp_step = step
    session.flush()
    return True


def verify_login(
    session: Session, password: str, code: str, *, now: datetime | None = None
) -> bool:
    """Password e codice insieme: si controllano sempre entrambi (nessun indizio su quale
    dei due è sbagliato)."""
    cred = credentials(session)
    if cred is None:
        return False
    password_ok: bool
    try:
        password_ok = _hasher.verify(cred.password_hash, password)
    except (VerificationError, InvalidHashError):
        password_ok = False
    if password_ok and _hasher.check_needs_rehash(cred.password_hash):
        cred.password_hash = _hasher.hash(password)
    code_ok = check_totp(session, code, now=now) if password_ok else False
    return password_ok and code_ok


def open_session(session: Session, user_agent: str | None, *, now: datetime | None = None) -> str:
    """Nuova sessione; restituisce il token da mettere nel cookie (nel DB solo l'hash)."""
    now = now or _now()
    token = secrets.token_urlsafe(32)
    session.add(
        AuthSession(
            token_hash=_hash_token(token),
            expires_at=now + timedelta(days=SESSION_DAYS),
            last_seen_at=now,
            user_agent=(user_agent or "")[:200] or None,
        )
    )
    session.flush()
    return token


def resolve_session(
    session: Session, token: str | None, *, now: datetime | None = None
) -> AuthSession | None:
    if not token:
        return None
    now = now or _now()
    row = session.scalar(select(AuthSession).where(AuthSession.token_hash == _hash_token(token)))
    if row is None:
        return None
    if row.expires_at <= now or row.last_seen_at + timedelta(days=IDLE_DAYS) <= now:
        session.delete(row)
        session.flush()
        return None
    if now - row.last_seen_at >= TOUCH_EVERY:
        row.last_seen_at = now
        session.flush()
    return row


def close_session(session: Session, token: str | None) -> None:
    if token:
        session.execute(delete(AuthSession).where(AuthSession.token_hash == _hash_token(token)))


def close_all_sessions(session: Session) -> int:
    return session.execute(delete(AuthSession)).rowcount or 0  # type: ignore[attr-defined]
