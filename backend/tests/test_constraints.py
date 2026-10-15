"""Vincoli del database: niente duplicati, enum validi, importi NUMERIC esatti."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Account, AccountSource, Balance, Category, Subcategory, Transaction
from tests.conftest import make_synced_transaction


def _assert_violates(db: Session, constraint: str) -> None:
    with pytest.raises(IntegrityError) as info:
        db.flush()
    assert info.value.orig is not None
    assert info.value.orig.diag.constraint_name == constraint  # type: ignore[attr-defined]
    db.rollback()


def test_no_floating_point_columns(db: Session) -> None:
    rows = db.execute(
        text(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND data_type IN ('real', 'double precision')"
        )
    ).all()
    assert rows == []


@pytest.mark.parametrize(
    ("table", "column"),
    [
        ("transactions", "amount"),
        ("transactions", "amount_eur"),
        ("balances", "balance"),
        ("budgets", "amount"),
        ("dividends", "amount"),
        ("positions", "market_value_eur"),
        ("net_worth_snapshots", "net_worth_eur"),
    ],
)
def test_money_columns_are_numeric_14_2(db: Session, table: str, column: str) -> None:
    row = db.execute(
        text(
            "SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).one()
    assert tuple(row) == ("numeric", 14, 2)


def test_amount_roundtrip_is_exact(db: Session, account: Account) -> None:
    tx = make_synced_transaction(db, account, amount="-123456789012.34")
    db.expire(tx)
    stored = db.scalar(select(Transaction.amount).where(Transaction.id == tx.id))
    assert stored == Decimal("-123456789012.34")
    assert isinstance(stored, Decimal)


def test_duplicate_external_id_on_same_account_is_rejected(db: Session, account: Account) -> None:
    tx = make_synced_transaction(db, account)
    db.add(
        Transaction(
            account_id=account.id,
            external_id=tx.external_id,
            dedupe_hash="x",
            booking_date=date(2026, 9, 1),
            amount=Decimal("1.00"),
            currency="EUR",
            amount_eur=Decimal("1.00"),
            description_raw="dup",
            description_clean="dup",
            kind="income",
        )
    )
    _assert_violates(db, "uq_transactions_account_id_external_id")


def test_manual_transactions_without_external_id_can_coexist(db: Session, account: Account) -> None:
    make_synced_transaction(db, account, external_id=None)
    make_synced_transaction(db, account, external_id=None)  # nessun errore


def test_duplicate_account_external_id_is_rejected(
    db: Session, source: AccountSource, account: Account
) -> None:
    db.add(
        Account(
            source_id=source.id,
            external_id=account.external_id,
            name="Doppione",
            type="checking",
            currency="EUR",
            institution="Banca Test",
        )
    )
    _assert_violates(db, "uq_accounts_source_id_external_id")


def test_duplicate_balance_for_same_day_is_rejected(db: Session, account: Account) -> None:
    for _ in range(2):
        db.add(
            Balance(
                account_id=account.id,
                as_of=date(2026, 9, 30),
                balance=Decimal("100.00"),
                currency="EUR",
                balance_type="booked",
                source="mock",
            )
        )
    _assert_violates(db, "uq_balances_account_id_as_of_balance_type")


def test_invalid_kind_is_rejected(db: Session, account: Account) -> None:
    make_synced_transaction(db, account)
    with pytest.raises(IntegrityError) as info:
        db.execute(text("UPDATE transactions SET kind = 'spesa'"))
    assert "ck_transactions_kind_valid" in str(info.value.orig)
    db.rollback()


def test_lowercase_currency_is_rejected(db: Session, account: Account) -> None:
    tx = make_synced_transaction(db, account)
    tx.currency = "eur"
    _assert_violates(db, "ck_transactions_currency_iso4217")


def test_subcategory_must_belong_to_category(db: Session, account: Account) -> None:
    trasporti = Category(name="Trasporti", kind="expense")
    spesa = Category(name="Spesa", kind="expense")
    db.add_all([trasporti, spesa])
    db.flush()
    treno = Subcategory(category_id=trasporti.id, name="Treno")
    db.add(treno)
    db.flush()

    tx = make_synced_transaction(db, account)
    tx.category_id = spesa.id
    tx.subcategory_id = treno.id
    _assert_violates(db, "fk_transactions_subcategory_in_category")


def test_transfer_pair_cannot_point_to_itself(db: Session, account: Account) -> None:
    tx = make_synced_transaction(db, account)
    tx.transfer_pair_id = tx.id
    _assert_violates(db, "ck_transactions_transfer_pair_not_self")
