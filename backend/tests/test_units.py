"""Unit test senza database."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.logging import mask_iban
from app.schemas.transactions import TransactionCreate
from app.services.transactions import compute_dedupe_hash, default_kind


def test_dedupe_hash_is_stable_and_ignores_spacing_and_case() -> None:
    a = compute_dedupe_hash(1, date(2026, 9, 1), Decimal("-5.00"), "EUR", "Bar  Centrale")
    b = compute_dedupe_hash(1, date(2026, 9, 1), Decimal("-5"), "eur", " bar centrale ")
    assert a == b
    assert len(a) == 64


@pytest.mark.parametrize(
    "changed",
    [
        {"account_id": 2},
        {"booking_date": date(2026, 9, 2)},
        {"amount": Decimal("-5.01")},
        {"currency": "USD"},
        {"description": "Bar Stazione"},
    ],
)
def test_dedupe_hash_changes_with_identity_fields(changed: dict[str, object]) -> None:
    base: dict[str, object] = {
        "account_id": 1,
        "booking_date": date(2026, 9, 1),
        "amount": Decimal("-5.00"),
        "currency": "EUR",
        "description": "Bar Centrale",
    }
    assert compute_dedupe_hash(**base) != compute_dedupe_hash(**(base | changed))  # type: ignore[arg-type]


def test_default_kind() -> None:
    assert default_kind(Decimal("-1")) == "expense"
    assert default_kind(Decimal("1")) == "income"
    assert default_kind(Decimal("0")) == "other"


def test_mask_iban() -> None:
    assert mask_iban("Bonifico da IT00X0000000000000000000000 ok") == "Bonifico da IT00…0000 ok"
    assert mask_iban("IBAN IT00 X000 0000 0000 0000 0000 000") == "IBAN IT00…0000"
    assert mask_iban("nessun dato sensibile") == "nessun dato sensibile"


def _tx(**overrides: object) -> TransactionCreate:
    data: dict[str, object] = {
        "account_id": 1,
        "booking_date": "2026-09-01",
        "amount": "-12.50",
        "description": "Caffè",
    }
    return TransactionCreate.model_validate(data | overrides)


def test_money_accepts_strings_and_integers() -> None:
    assert _tx().amount == Decimal("-12.50")
    assert _tx(amount=-12).amount == Decimal("-12")


def test_money_rejects_floats() -> None:
    with pytest.raises(ValidationError, match="amounts must be strings"):
        _tx(amount=-12.5)


def test_money_rejects_more_than_two_decimals() -> None:
    with pytest.raises(ValidationError):
        _tx(amount="1.234")


def test_non_eur_requires_amount_eur() -> None:
    with pytest.raises(ValidationError, match="amount_eur"):
        _tx(currency="USD")
    assert _tx(currency="USD", amount_eur="-11.20").amount_eur == Decimal("-11.20")


def test_settings_parse_comma_separated_lists(tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        data_dir=tmp_path,
        cors_origins="http://localhost:5173, http://127.0.0.1:5173",  # type: ignore[arg-type]
    )
    assert settings.cors_origins == ["http://localhost:5173", "http://127.0.0.1:5173"]
    assert settings.resolved_db_env_file == tmp_path / "secrets" / "db.env"


def test_settings_read_db_credentials_from_file(tmp_path: Path) -> None:
    (tmp_path / "secrets").mkdir()
    (tmp_path / "secrets" / "db.env").write_text(
        "DB_HOST=127.0.0.1\nDB_PORT=5432\nDB_USER=u\nDB_PASSWORD=p@ss:w/rd\n"
        "DB_NAME=finance\nDB_NAME_TEST=finance_test\n",
        encoding="utf-8",
    )
    settings = Settings(_env_file=None, data_dir=tmp_path)
    assert settings.db_url().database == "finance"
    assert settings.db_url(test=True).database == "finance_test"
    assert settings.db_url().password == "p@ss:w/rd"
    assert "p@ss" not in repr(settings.db_url())


def test_settings_fail_clearly_without_credentials(tmp_path: Path) -> None:
    settings = Settings(_env_file=None, data_dir=tmp_path)
    with pytest.raises(RuntimeError, match="credenziali"):
        settings.db_url()
