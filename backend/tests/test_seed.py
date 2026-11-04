from __future__ import annotations

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.locale import data_locale, stored_locale
from app.db.seed import MerchantsFile, _load_yaml, run_seed
from app.models import (
    AppSetting,
    Category,
    IncomeClassification,
    Merchant,
    Subcategory,
    TransactionRule,
)


def _count(db: Session, model: type[object]) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_seed_inserts_spec_data(db: Session) -> None:
    report = run_seed(db)
    assert (report.categories, report.subcategories, report.income_classifications) == (18, 16, 9)

    investimenti = db.scalar(select(Category).where(Category.code == "investimenti"))
    assert investimenti is not None
    assert investimenti.kind == "investment"
    assert investimenti.excluded_from_spending is True
    assert investimenti.is_system is True

    abbonamenti = db.scalar(select(Category).where(Category.code == "abbonamenti"))
    assert abbonamenti is not None
    assert [s.name for s in abbonamenti.subcategories] == [
        "Software e AI",
        "Musica",
        "Cloud e archiviazione",
        "Altri servizi",
    ]

    spending = db.scalars(select(Category.code).where(Category.excluded_from_spending)).all()
    assert spending == ["investimenti"]


def test_seed_is_idempotent(db: Session) -> None:
    run_seed(db)
    before = (_count(db, Category), _count(db, Subcategory), _count(db, IncomeClassification))
    report = run_seed(db)
    after = (_count(db, Category), _count(db, Subcategory), _count(db, IncomeClassification))
    assert report.total == 0
    assert before == after == (18, 16, 9)


def test_seed_preserves_user_changes(db: Session) -> None:
    run_seed(db)
    spesa = db.scalar(select(Category).where(Category.code == "spesa"))
    assert spesa is not None
    spesa.name = "Supermercato"
    spesa.color = "#00aa00"
    db.flush()

    run_seed(db)
    db.refresh(spesa)
    assert (spesa.name, spesa.color) == ("Supermercato", "#00aa00")
    assert db.scalar(select(Category).where(Category.name == "Spesa")) is None


def test_seed_adopts_category_created_by_hand(db: Session) -> None:
    db.add(Category(name="Palestra", kind="expense"))
    db.flush()
    report = run_seed(db)
    assert report.categories == 18
    sport = db.scalar(select(Category).where(Category.name == "Sport e palestra"))
    assert sport is not None
    assert sport.code == "sport"


# --- Lingua dei dati (ADR 0006, fase I4) -------------------------------------------------


def _codes(db: Session) -> tuple[set[str | None], set[tuple[str | None, str | None]], set[str]]:
    categories = set(db.scalars(select(Category.code)))
    subcategories = {
        (c, s)
        for c, s in db.execute(select(Category.code, Subcategory.code).join(Subcategory.category))
    }
    incomes = set(db.scalars(select(IncomeClassification.code)))
    return categories, subcategories, incomes


def test_english_seed_has_the_same_codes(db: Session) -> None:
    run_seed(db, locale="it")
    italian = _codes(db)
    italian_rules = set(db.scalars(select(TransactionRule.code)))
    for model in (TransactionRule, Merchant, Subcategory, Category, IncomeClassification):
        db.execute(delete(model))
    db.execute(delete(AppSetting))

    report = run_seed(db, locale="en")
    assert (report.categories, report.subcategories, report.income_classifications) == (18, 16, 9)
    assert _codes(db) == italian
    assert set(db.scalars(select(TransactionRule.code))) == italian_rules
    spesa = db.scalar(select(Category).where(Category.code == "spesa"))
    assert spesa is not None
    assert spesa.name == "Groceries"
    assert db.scalar(select(Category.name).where(Category.code == "uscite")) == "Going out"


def test_english_seed_is_idempotent(db: Session) -> None:
    run_seed(db, locale="en")
    report = run_seed(db, locale="en")
    assert report.total == 0


def test_empty_database_takes_seed_locale_and_keeps_it(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "seed_locale", "en")
    assert data_locale(db) == "en"
    run_seed(db)
    assert stored_locale(db) == "en"
    assert db.scalar(select(Category.name).where(Category.code == "spesa")) == "Groceries"

    # Cambiare SEED_LOCALE dopo non cambia la lingua salvata.
    monkeypatch.setattr(get_settings(), "seed_locale", "it")
    assert data_locale(db) == "en"
    assert run_seed(db).total == 0


def test_populated_database_without_locale_stays_italian(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Un'installazione nata prima della I4: SEED_LOCALE=en non la tocca."""
    run_seed(db, locale="it")
    db.execute(delete(AppSetting))
    before = sorted(tuple(row) for row in db.execute(select(Category.code, Category.name)))

    monkeypatch.setattr(get_settings(), "seed_locale", "en")
    assert data_locale(db) == "it"
    assert run_seed(db).total == 0
    assert stored_locale(db) is None
    assert sorted(tuple(row) for row in db.execute(select(Category.code, Category.name))) == before


def test_every_english_merchant_and_rule_points_to_known_codes() -> None:
    """Merchant e regole inglesi usano solo codici del seed (lo controlla anche run_seed,
    qui senza database) e riconoscono gli stessi merchant di quelli italiani."""
    base = get_settings().seeds_dir
    italian = MerchantsFile.model_validate(_load_yaml(base / "merchants.yaml"))
    english = MerchantsFile.model_validate(_load_yaml(base / "en" / "merchants.yaml"))
    english_aliases = {a for m in english.merchants for a in m.aliases}
    missing = {a for m in italian.merchants for a in m.aliases} - english_aliases
    assert missing == set()
