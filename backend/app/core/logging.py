"""Logging applicativo: console + file ruotato in `${DATA_DIR}/logs`.

Un filtro maschera gli IBAN prima che qualsiasi messaggio venga scritto.
"""

from __future__ import annotations

import logging
import re
from logging.handlers import RotatingFileHandler

from app.core.config import Settings

_IBAN_RE = re.compile(r"\b([A-Z]{2}\d{2})((?:\s?[A-Z0-9]){8,30})\b")


def mask_iban(text: str) -> str:
    """`IT00X0000000000000000000000` → `IT00…0000` (prefisso paese + ultime 4 cifre)."""

    def _mask(match: re.Match[str]) -> str:
        tail = match.group(2).replace(" ", "")
        return f"{match.group(1)}…{tail[-4:]}"

    return _IBAN_RE.sub(_mask, text)


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        masked = mask_iban(message)
        if masked != message:
            record.msg = masked
            record.args = None
        return True


def configure_logging(settings: Settings) -> None:
    root = logging.getLogger()
    if any(isinstance(f, SensitiveDataFilter) for h in root.handlers for f in h.filters):
        return  # già configurato (es. reload di uvicorn)

    formatter = logging.Formatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s")
    handlers: list[logging.Handler] = [logging.StreamHandler()]

    if settings.app_env != "test" and settings.logs_dir.is_dir():
        handlers.append(
            RotatingFileHandler(
                settings.logs_dir / "backend.log",
                maxBytes=5_000_000,
                backupCount=5,
                encoding="utf-8",
            )
        )

    for handler in handlers:
        handler.setFormatter(formatter)
        handler.addFilter(SensitiveDataFilter())
        root.addHandler(handler)
    root.setLevel(settings.log_level.upper())
    # Le richieste HTTP verso banche e broker hanno nell'indirizzo gli identificativi dei
    # conti: nei log solo gli avvisi, mai ogni chiamata.
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
