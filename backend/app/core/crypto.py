"""Cifratura dei dati sensibili salvati nel database (SPEC §9): sessioni dei provider e
token di stato del consenso.

Fernet (AES-128-CBC + HMAC-SHA256). La chiave sta in `${DATA_DIR}/secrets/app.key`,
fuori dal repository e dal database; se manca viene creata al primo uso (nella cartella
dei segreti, che ha i permessi del solo utente). Perdere la chiave significa solo dover
ricollegare le banche: i dati sincronizzati restano leggibili.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

KEY_FILE = "app.key"


class DecryptionError(RuntimeError):
    """Dato non decifrabile, scaduto o manomesso (messaggio senza contenuto)."""


def key_path() -> Path:
    return get_settings().secrets_dir / KEY_FILE


def load_or_create_key(path: Path) -> bytes:
    if path.is_file():
        return path.read_bytes().strip()
    path.parent.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key()
    with path.open("xb") as f:  # mai sovrascrivere una chiave esistente
        f.write(key)
    return key


@lru_cache
def _fernet() -> Fernet:
    return Fernet(load_or_create_key(key_path()))


def encrypt_json(data: dict[str, Any]) -> bytes:
    return _fernet().encrypt(json.dumps(data, separators=(",", ":")).encode())


def decrypt_json(token: bytes | str, *, ttl: int | None = None) -> dict[str, Any]:
    """`ttl` in secondi: oltre, il dato è considerato scaduto."""
    raw = token.encode() if isinstance(token, str) else token
    try:
        value = json.loads(_fernet().decrypt(raw, ttl=ttl))
    except (InvalidToken, ValueError):
        raise DecryptionError("Dato cifrato non valido o scaduto") from None
    if not isinstance(value, dict):
        raise DecryptionError("Dato cifrato non valido")
    return value


def reset_cache() -> None:
    """Per i test (chiave in una cartella temporanea)."""
    _fernet.cache_clear()
