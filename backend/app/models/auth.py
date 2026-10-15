"""Accesso alla dashboard (SPEC §15): un solo utente, password + codice TOTP."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import BigInteger, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class AuthCredential(IdMixin, TimestampMixin, Base):
    """Credenziali dell'unico utente (al massimo una riga)."""

    __tablename__ = "auth_credentials"

    #: Hash Argon2id della password (mai la password).
    password_hash: Mapped[str]
    #: Segreto TOTP cifrato con la chiave dell'app (`app.key`).
    totp_secret_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    #: Ultimo intervallo TOTP usato: lo stesso codice non vale due volte.
    last_totp_step: Mapped[int | None] = mapped_column(BigInteger)


class AuthSession(IdMixin, TimestampMixin, Base):
    """Sessione aperta da un login. Nel cookie c'è il token, qui solo il suo hash."""

    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[dt.datetime]
    last_seen_at: Mapped[dt.datetime]
    #: Solo per riconoscere la sessione nell'elenco (es. "Chrome su Windows").
    user_agent: Mapped[str | None]
