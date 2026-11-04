"""Modalità demo: database vuoto → seed e dati di prova, senza doppioni ai riavvii."""

from __future__ import annotations

from collections.abc import Callable
from contextlib import nullcontext
from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.demo import bootstrap_demo
from app.models import Account, AccountSource, Category, Transaction
from app.models.enums import Provider

DAY = date(2026, 9, 15)


def _count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_bootstrap_fills_an_empty_database_once(
    db: Session, freeze_today: Callable[[date], None]
) -> None:
    freeze_today(DAY)
    assert _count(db, Category) == 0

    assert bootstrap_demo(lambda: nullcontext(db)) == 3
    sources = db.scalars(select(AccountSource)).all()
    assert {s.provider for s in sources} == {Provider.MOCK.value}
    assert _count(db, Category) > 0
    transactions = _count(db, Transaction)
    assert transactions > 500

    # Al riavvio risincronizza le stesse sorgenti: niente sorgenti né movimenti doppi.
    assert bootstrap_demo(lambda: nullcontext(db)) == 3
    assert _count(db, AccountSource) == 3
    assert _count(db, Transaction) == transactions


def test_bootstrap_leaves_real_sources_alone(db: Session) -> None:
    db.add(
        AccountSource(
            provider=Provider.MANUAL,
            institution="Banca",
            display_name="Conto inserito a mano",
        )
    )
    db.commit()
    assert bootstrap_demo(lambda: nullcontext(db)) == 0
    assert _count(db, AccountSource) == 1


def test_bootstrap_in_english(
    db: Session, freeze_today: Callable[[date], None], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Installazione nuova con SEED_LOCALE=en: categorie, sorgenti, conti e causali in inglese."""
    freeze_today(DAY)
    monkeypatch.setattr(get_settings(), "seed_locale", "en")
    assert bootstrap_demo(lambda: nullcontext(db)) == 3

    names = set(db.scalars(select(AccountSource.display_name)))
    assert names == {"Crédit Agricole Italia (demo)", "Revolut (demo)", "Trading 212 (demo)"}
    assert db.scalar(select(Category.name).where(Category.code == "spesa")) == "Groceries"
    accounts = set(db.scalars(select(Account.name)))
    assert {"Current account", "Credit card", "EUR account"} <= accounts
    descriptions = set(db.scalars(select(Transaction.description_raw)))
    assert any(d.startswith("SEPA CREDIT TRANSFER FROM ACME LTD") for d in descriptions)
    assert not any("BONIFICO" in d or "GIROCONTO" in d for d in descriptions)
