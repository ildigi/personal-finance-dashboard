from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.seed import run_seed
from app.models import Category, IncomeClassification, Subcategory


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
