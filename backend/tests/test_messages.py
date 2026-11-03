"""Codici dei messaggi per l'interfaccia (ADR 0006): tutti in catalogo, tutti esportati."""

from __future__ import annotations

import json
import re

import pytest

from app.core.config import BACKEND_DIR
from app.core.messages import MESSAGE_CODES, AppError, http_error

# Un codice letterale passato a un errore o a `coded(...)`: "bank.consent_expired", "not_found".
_USES = re.compile(
    r"(?:Error|http_error|coded|_unprocessable)\(\s*(?:status\.\w+,\s*|\d+,\s*)?f?\"([a-z_]+(?:\.[a-z_]+)?)\""
)


def test_every_code_used_in_the_backend_is_in_the_catalog() -> None:
    used: set[str] = set()
    for path in (BACKEND_DIR / "app").rglob("*.py"):
        used.update(_USES.findall(path.read_text(encoding="utf-8")))
    assert used, "nessun codice trovato: l'espressione regolare non funziona più"
    assert used - MESSAGE_CODES == set()


def test_unknown_codes_are_refused() -> None:
    with pytest.raises(ValueError, match="sconosciuto"):
        AppError("non.esiste")
    with pytest.raises(ValueError, match="sconosciuto"):
        http_error(400, "non.esiste")


def test_http_error_carries_code_and_params() -> None:
    error = http_error(404, "not_found", id=3)
    assert error.status_code == 404
    assert error.detail == {"code": "not_found", "params": {"id": 3}}
    wrapped = http_error(409, AppError("bank.unavailable", bank="CA"))
    assert wrapped.detail == {"code": "bank.unavailable", "params": {"bank": "CA"}}


def test_no_code_is_a_prefix_of_another() -> None:
    # Nel frontend i codici sono chiavi annidate: "bank" non può essere sia testo sia gruppo.
    for code in MESSAGE_CODES:
        assert not any(other.startswith(f"{code}.") for other in MESSAGE_CODES), code


def test_frontend_schema_lists_the_current_codes() -> None:
    schema_path = BACKEND_DIR.parent / "frontend" / "src" / "api" / "openapi.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    assert schema.get("x-message-codes") == sorted(MESSAGE_CODES), (
        "rigenera il client: cd frontend && pnpm api:generate"
    )
