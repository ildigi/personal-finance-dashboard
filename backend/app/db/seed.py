"""Seed dei dati iniziali: categorie, sottocategorie, tipologie di entrata, merchant noti
e regole di sistema.

Idempotente: inserisce solo ciò che manca (chiave `code`) e non modifica mai
righe esistenti, così le personalizzazioni fatte dall'interfaccia restano.

Uso: `uv run python -m app.db.seed` (aggiungere `--test` per il DB dei test).
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.classification.text import match_text
from app.core.config import get_settings
from app.models import Category, IncomeClassification, Merchant, Subcategory, TransactionRule
from app.models.enums import CategoryKind, Direction, MerchantOrigin, RuleOrigin, TransactionKind
from app.schemas.rules import RuleActions, RuleConditions


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SubcategorySeed(_Strict):
    code: str
    name: str


class CategorySeed(_Strict):
    code: str
    name: str
    kind: CategoryKind
    icon: str | None = None
    color: str | None = None
    is_system: bool = False
    excluded_from_spending: bool = False
    subcategories: list[SubcategorySeed] = Field(default_factory=list)


class CategoriesFile(_Strict):
    categories: list[CategorySeed]


class IncomeClassificationSeed(_Strict):
    code: str
    label: str


class IncomeClassificationsFile(_Strict):
    income_classifications: list[IncomeClassificationSeed]


class MerchantSeed(_Strict):
    key: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    category: str | None = None
    subcategory: str | None = None


class MerchantsFile(_Strict):
    merchants: list[MerchantSeed]


class RuleConditionsSeed(_Strict):
    description_contains: str | None = None
    description_regex: str | None = None
    merchant: str | None = None
    counterparty_iban: str | None = None
    amount_min: Decimal | None = None
    amount_max: Decimal | None = None
    amounts: list[Decimal] | None = None
    direction: Direction | None = None
    mcc: str | None = None


class RuleActionsSeed(_Strict):
    category: str | None = None
    subcategory: str | None = None
    kind: TransactionKind | None = None
    income_type: str | None = None


class RuleSeed(_Strict):
    code: str
    name: str
    priority: int
    conditions: RuleConditionsSeed
    actions: RuleActionsSeed


class RulesFile(_Strict):
    rules: list[RuleSeed]


@dataclass
class SeedReport:
    categories: int = 0
    subcategories: int = 0
    income_classifications: int = 0
    merchants: int = 0
    rules: int = 0

    @property
    def total(self) -> int:
        return (
            self.categories
            + self.subcategories
            + self.income_classifications
            + self.merchants
            + self.rules
        )


def _load_yaml(path: Path) -> object:
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def seed_categories(session: Session, data: CategoriesFile, report: SeedReport) -> None:
    for position, item in enumerate(data.categories, start=1):
        category = session.scalar(select(Category).where(Category.code == item.code))
        if category is None:
            # Una categoria creata a mano con lo stesso nome viene "adottata".
            category = session.scalar(
                select(Category).where(Category.name == item.name, Category.code.is_(None))
            )
            if category is not None:
                category.code = item.code
        if category is None:
            category = Category(
                code=item.code,
                name=item.name,
                kind=item.kind,
                icon=item.icon,
                color=item.color,
                sort_order=position * 10,
                is_system=item.is_system,
                excluded_from_spending=item.excluded_from_spending,
            )
            session.add(category)
            session.flush()
            report.categories += 1

        for sub_position, sub in enumerate(item.subcategories, start=1):
            existing = session.scalar(
                select(Subcategory).where(
                    Subcategory.category_id == category.id,
                    (Subcategory.code == sub.code) | (Subcategory.name == sub.name),
                )
            )
            if existing is not None:
                if existing.code is None:
                    existing.code = sub.code
                continue
            session.add(
                Subcategory(
                    category_id=category.id,
                    code=sub.code,
                    name=sub.name,
                    sort_order=sub_position * 10,
                )
            )
            report.subcategories += 1


def seed_income_classifications(
    session: Session, data: IncomeClassificationsFile, report: SeedReport
) -> None:
    existing = set(session.scalars(select(IncomeClassification.code)))
    for item in data.income_classifications:
        if item.code in existing:
            continue
        session.add(IncomeClassification(code=item.code, label=item.label, is_system=True))
        report.income_classifications += 1


def _category_ids(
    session: Session, category_code: str | None, subcategory_code: str | None, where: str
) -> tuple[int | None, int | None]:
    if category_code is None:
        if subcategory_code is not None:
            raise ValueError(f"{where}: sottocategoria senza categoria")
        return None, None
    category = session.scalar(select(Category).where(Category.code == category_code))
    if category is None:
        raise ValueError(f"{where}: categoria sconosciuta {category_code!r}")
    if subcategory_code is None:
        return category.id, None
    sub = session.scalar(
        select(Subcategory).where(
            Subcategory.category_id == category.id, Subcategory.code == subcategory_code
        )
    )
    if sub is None:
        raise ValueError(f"{where}: sottocategoria sconosciuta {subcategory_code!r}")
    return category.id, sub.id


def seed_merchants(session: Session, data: MerchantsFile, report: SeedReport) -> None:
    for item in data.merchants:
        category_id, subcategory_id = _category_ids(
            session, item.category, item.subcategory, f"merchant {item.key}"
        )
        aliases = [a for a in (match_text(x) for x in item.aliases) if a]
        merchant = session.scalar(select(Merchant).where(Merchant.normalized_key == item.key))
        if merchant is None:
            session.add(
                Merchant(
                    name=item.name,
                    normalized_key=item.key,
                    aliases=aliases,
                    default_category_id=category_id,
                    default_subcategory_id=subcategory_id,
                    origin=MerchantOrigin.SEED,
                )
            )
            report.merchants += 1
        elif merchant.origin == MerchantOrigin.AUTO:
            # Creato in automatico con la stessa chiave prima del seed: diventa quello noto.
            merchant.name = item.name
            merchant.aliases = sorted({*merchant.aliases, *aliases})
            merchant.default_category_id = category_id
            merchant.default_subcategory_id = subcategory_id
            merchant.origin = MerchantOrigin.SEED
            report.merchants += 1
        elif merchant.origin == MerchantOrigin.SEED:
            # Nuove varianti di un merchant del seed (es. "virginactive" via PayPal): solo
            # aggiunte, nome e categoria restano quelli che hai scelto.
            if not set(aliases) <= set(merchant.aliases):
                merchant.aliases = sorted({*merchant.aliases, *aliases})
            # Sottocategoria nuova nel seed (es. Ryanair → Viaggi · Voli): solo se la
            # categoria è ancora quella del seed e una sottocategoria non c'è.
            if (
                subcategory_id is not None
                and merchant.default_subcategory_id is None
                and merchant.default_category_id == category_id
            ):
                merchant.default_subcategory_id = subcategory_id
    session.flush()


def seed_rules(session: Session, data: RulesFile, report: SeedReport) -> None:
    existing = set(
        session.scalars(select(TransactionRule.code).where(TransactionRule.code.is_not(None)))
    )
    for item in data.rules:
        if item.code in existing:
            continue
        where = f"regola {item.code}"
        c = item.conditions
        conditions: dict[str, Any] = c.model_dump(exclude_none=True, exclude={"merchant"})
        if c.merchant is not None:
            merchant_id = session.scalar(
                select(Merchant.id).where(Merchant.normalized_key == c.merchant)
            )
            if merchant_id is None:
                raise ValueError(f"{where}: merchant sconosciuto {c.merchant!r}")
            conditions["merchant_id"] = merchant_id
        a = item.actions
        category_id, subcategory_id = _category_ids(session, a.category, a.subcategory, where)
        actions: dict[str, Any] = {
            "category_id": category_id,
            "subcategory_id": subcategory_id,
            "kind": a.kind,
        }
        if a.income_type is not None:
            income = session.scalar(
                select(IncomeClassification).where(IncomeClassification.code == a.income_type)
            )
            if income is None:
                raise ValueError(f"{where}: tipologia di entrata sconosciuta {a.income_type!r}")
            actions["income_type_id"] = income.id
        session.add(
            TransactionRule(
                code=item.code,
                name=item.name,
                priority=item.priority,
                origin=RuleOrigin.SEED,
                # Stessa validazione dell'API: niente regole di sistema rotte.
                conditions=RuleConditions.model_validate(conditions).model_dump(
                    mode="json", exclude_none=True
                ),
                actions=RuleActions.model_validate(actions).model_dump(
                    mode="json", exclude_none=True
                ),
            )
        )
        report.rules += 1
    session.flush()


def run_seed(session: Session, seeds_dir: Path | None = None) -> SeedReport:
    """Applica tutti i seed nella sessione data (il commit è a carico del chiamante)."""
    seeds_dir = seeds_dir or get_settings().seeds_dir
    report = SeedReport()
    categories = CategoriesFile.model_validate(_load_yaml(seeds_dir / "categories.yaml"))
    incomes = IncomeClassificationsFile.model_validate(
        _load_yaml(seeds_dir / "income_classifications.yaml")
    )
    merchants = MerchantsFile.model_validate(_load_yaml(seeds_dir / "merchants.yaml"))
    rules = RulesFile.model_validate(_load_yaml(seeds_dir / "rules.yaml"))
    seed_categories(session, categories, report)
    seed_income_classifications(session, incomes, report)
    session.flush()
    seed_merchants(session, merchants, report)
    seed_rules(session, rules, report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed dei dati iniziali")
    parser.add_argument("--test", action="store_true", help="usa il database dei test")
    args = parser.parse_args()

    engine = create_engine(get_settings().db_url(test=args.test))
    with Session(engine) as session, session.begin():
        report = run_seed(session)
    engine.dispose()
    print(
        f"Seed completato: {report.categories} categorie, {report.subcategories} sottocategorie, "
        f"{report.income_classifications} tipologie di entrata, {report.merchants} merchant, "
        f"{report.rules} regole inserite."
    )


if __name__ == "__main__":
    main()
