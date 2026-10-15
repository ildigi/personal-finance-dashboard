"""Classificazione dei dati di prova: accuratezza rispetto alle etichette attese dello scenario.

Obiettivo della Fase 5 (SPEC §16): almeno il 90% dei movimenti mock classificati correttamente.
"""

from __future__ import annotations

from collections import Counter
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.mock_setup import ensure_mock_sources
from app.ingestion.runner import run_sync
from app.integrations.mock import scenario as sc
from app.models import (
    Account,
    Category,
    IncomeClassification,
    InvestmentCashFlow,
    Subcategory,
    Transaction,
)
from app.models.enums import ClassificationSource, TransactionKind

DAY = date(2026, 9, 15)


@pytest.fixture
def mock_db(seeded: Session) -> Session:
    for source in ensure_mock_sources(seeded):
        assert run_sync(seeded, source, today=DAY).status == "success"
    return seeded


def _actual_label(db: Session, tx: Transaction) -> str:
    if tx.kind == TransactionKind.INCOME:
        income = db.get(IncomeClassification, tx.income_type_id) if tx.income_type_id else None
        return f"income@{income.code if income else ''}"
    if tx.category_id is None:
        return tx.kind
    category = db.get(Category, tx.category_id)
    assert category is not None
    label = f"{tx.kind}:{category.code}"
    if tx.subcategory_id is not None:
        sub = db.get(Subcategory, tx.subcategory_id)
        assert sub is not None
        label += f"/{sub.code}"
    return label


def _expected(db: Session) -> dict[int, str]:
    """id del movimento → etichetta attesa, collegando gli ID esterni dello scenario."""
    ledger = sc.ledger_for(DAY)
    by_external = {
        (account, item.external_id(DAY)): item.expect
        for account, items in ledger.transactions.items()
        for item in items
    }
    accounts = {a.id: a.external_id for a in db.scalars(select(Account))}
    result = {}
    for tx in db.scalars(select(Transaction)):
        key = (accounts[tx.account_id], tx.external_id)
        assert key in by_external, key
        result[tx.id] = by_external[key]
    return result


def test_mock_accuracy_is_at_least_90_percent(mock_db: Session) -> None:
    expected = _expected(mock_db)
    wrong: Counter[tuple[str, str]] = Counter()
    for tx in mock_db.scalars(select(Transaction)):
        actual = _actual_label(mock_db, tx)
        if actual != expected[tx.id]:
            wrong[(expected[tx.id], actual)] += 1
    total = len(expected)
    accuracy = 1 - sum(wrong.values()) / total
    print(f"\nAccuratezza {accuracy:.1%} su {total} movimenti; errori: {wrong.most_common()}")
    assert accuracy >= 0.90, wrong.most_common()


def test_mock_coverage(mock_db: Session) -> None:
    """Quasi tutto viene classificato in automatico; restano solo i casi senza indizi."""
    sources = Counter(mock_db.scalars(select(Transaction.classification_source)))
    total = sum(sources.values())
    unclassified = sources[ClassificationSource.NONE]
    print(f"\nFonti: {dict(sources)}")
    assert unclassified / total < 0.10


def test_mock_transfers_and_investments_are_matched(mock_db: Session) -> None:
    txs = list(mock_db.scalars(select(Transaction)))
    transfers = [t for t in txs if t.kind == TransactionKind.INTERNAL_TRANSFER]
    assert transfers
    assert all(t.transfer_pair_id is not None for t in transfers)
    by_id = {t.id: t for t in txs}
    for t in transfers:
        partner = by_id[t.transfer_pair_id]  # type: ignore[index]
        assert partner.transfer_pair_id == t.id
        assert partner.amount_eur == -t.amount_eur
        assert partner.account_id != t.account_id

    flows = list(mock_db.scalars(select(InvestmentCashFlow)))
    assert flows
    assert all(f.transaction_id is not None for f in flows)
    for f in flows:
        assert by_id[f.transaction_id].kind == TransactionKind.INVESTMENT_TRANSFER  # type: ignore[index]


def test_reclassification_is_stable(mock_db: Session) -> None:
    """Una nuova sincronizzazione senza novità non cambia nessuna classificazione."""
    source = ensure_mock_sources(mock_db)[0]
    summary = run_sync(mock_db, source, today=DAY)
    job = next(j for j in summary.jobs if j.job == "classification")
    assert job.updated == 0
