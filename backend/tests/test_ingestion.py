"""Pipeline di ingestione: idempotenza, pending → booked, override, errori, broker."""

from __future__ import annotations

import inspect
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ingestion.mock_setup import ensure_mock_sources, remove_mock_data
from app.ingestion.runner import run_sync
from app.integrations import base
from app.integrations.base import ProviderAccount, ProviderBalance, ProviderTransaction
from app.integrations.mock import scenario as sc
from app.integrations.mock.connector import MockBankConnector, MockBrokerConnector
from app.models import (
    Account,
    AccountSource,
    Balance,
    Category,
    InvestmentOrder,
    ManualOverride,
    Merchant,
    PortfolioCashSnapshot,
    Position,
    SyncLog,
    Transaction,
)
from app.models.enums import TransactionKind
from app.schemas.transactions import TransactionUpdate
from app.services.transactions import update_transaction

DAY = date(2026, 9, 15)  # martedì


def _count(db: Session, *where: object) -> int:
    return db.scalar(select(func.count()).select_from(Transaction).where(*where)) or 0  # type: ignore[arg-type]


def _source(db: Session, ref: str) -> AccountSource:
    return next(s for s in ensure_mock_sources(db) if s.credentials_ref == ref)


# --- Scenario e connettori ----------------------------------------------------------------


def test_connectors_are_read_only() -> None:
    """Né le interfacce né i connettori finti espongono metodi di scrittura."""
    classes = [base.BankConnector, base.BrokerConnector, MockBankConnector, MockBrokerConnector]
    for cls in classes:
        public = [
            name
            for name, _ in inspect.getmembers(cls, predicate=inspect.isfunction)
            if not name.startswith("_")
        ]
        assert public, cls
        assert all(name.startswith(("get_", "list_")) for name in public), (cls, public)


def test_scenario_is_deterministic_across_sync_dates() -> None:
    early = MockBankConnector("revolut", DAY).get_transactions(sc.REV_EUR, sc.EPOCH)
    later = MockBankConnector("revolut", DAY + timedelta(days=5)).get_transactions(
        sc.REV_EUR, sc.EPOCH
    )
    booked_early = {t.external_id: t.amount for t in early if t.status == "booked"}
    booked_later = {t.external_id: t.amount for t in later if t.status == "booked"}
    assert booked_early.items() <= booked_later.items()


def test_scenario_covers_the_expected_life_events() -> None:
    ledger = sc.ledger_for(DAY)
    ca = " ".join(t.description for t in ledger.transactions[sc.CA_CONTO])
    rev = " ".join(t.description for t in ledger.transactions[sc.REV_EUR])
    assert "STIPENDIO" in ca
    assert "TRADING 212" in ca
    assert "REVOLUT" in ca
    assert "Top-up" in rev
    assert "Apple.com/bill" in rev
    assert "Refund from AMAZON.IT" in rev
    assert any(t.original_currency == "USD" for t in ledger.transactions[sc.REV_EUR])
    months = {(t.day.year, t.day.month) for t in ledger.transactions[sc.CA_CONTO]}
    assert len(months) >= 12
    # Le ricariche compaiono su entrambi i conti con lo stesso importo.
    top_ups_out = sorted(
        -t.amount for t in ledger.transactions[sc.CA_CONTO] if "REVOLUT" in t.description
    )
    top_ups_in = sorted(
        t.amount for t in ledger.transactions[sc.REV_EUR] if "Top-up" in t.description
    )
    assert top_ups_out[: len(top_ups_in)] == top_ups_in


# --- Banca ------------------------------------------------------------------------------------


def test_two_consecutive_syncs_create_no_duplicates(db: Session) -> None:
    source = _source(db, "mock:revolut")
    first = run_sync(db, source, today=DAY)
    total = _count(db)
    second = run_sync(db, source, today=DAY)

    assert first.status == second.status == "success"
    assert total > 300
    assert _count(db) == total
    tx_job = next(j for j in second.jobs if j.job == "transactions")
    assert tx_job.created == 0
    assert db.scalar(select(func.count()).select_from(Balance)) == 2


def test_pending_becomes_booked_without_duplicates(db: Session) -> None:
    source = _source(db, "mock:revolut")
    run_sync(db, source, today=DAY)
    pending = db.scalars(select(Transaction).where(Transaction.status == "pending")).all()
    assert pending, "lo scenario deve avere movimenti in sospeso"
    pending_ids = {p.id: p.amount for p in pending}

    later = DAY + timedelta(days=3)
    summary = run_sync(db, source, today=later)
    tx_job = next(j for j in summary.jobs if j.job == "transactions")
    assert tx_job.details.get("promoted", 0) >= len(pending_ids)

    expected = len(MockBankConnector("revolut", later).get_transactions(sc.REV_EUR, sc.EPOCH))
    assert _count(db) == expected
    for tx_id, amount in pending_ids.items():
        tx = db.get(Transaction, tx_id)
        assert tx is not None, "il pending è stato promosso, non ricreato"
        assert tx.status == "booked"
        assert tx.amount == amount
        assert tx.external_id is not None
        assert tx.external_id.startswith("B-")
    assert _count(db, Transaction.external_id.like("P-%"), Transaction.status == "booked") == 0


def test_manual_correction_survives_sync(db: Session) -> None:
    db.add(Category(name="Uscite", kind="expense"))
    db.flush()
    category = db.scalar(select(Category).where(Category.name == "Uscite"))
    assert category is not None

    source = _source(db, "mock:revolut")
    run_sync(db, source, today=DAY)
    tx = db.scalars(select(Transaction).where(Transaction.status == "pending")).first()
    assert tx is not None
    update_transaction(
        db,
        tx,
        TransactionUpdate(category_id=category.id, kind=TransactionKind.OTHER, notes="controllare"),
    )
    db.commit()

    run_sync(db, source, today=DAY + timedelta(days=3))
    db.refresh(tx)
    assert tx.status == "booked"
    assert (tx.category_id, tx.kind, tx.notes) == (category.id, "other", "controllare")
    assert tx.classification_source == "manual"
    assert db.scalar(select(func.count()).select_from(ManualOverride)) == 3


class _FlakyBank:
    """Banca finta minimale: restituisce ciò che le si dice."""

    def __init__(self) -> None:
        self.transactions: list[ProviderTransaction] = []

    def list_accounts(self) -> list[ProviderAccount]:
        return [ProviderAccount("acc", "Conto", "checking", "EUR", "Banca")]

    def get_balances(self, account_external_id: str) -> list[ProviderBalance]:
        return []

    def get_transactions(self, account_external_id: str, since: date) -> list[ProviderTransaction]:
        return [t for t in self.transactions if t.booking_date >= since]


def _ptx(ext: str, amount: str, status: str = "pending", day: date = DAY) -> ProviderTransaction:
    return ProviderTransaction(
        account_external_id="acc",
        external_id=ext,
        booking_date=day,
        status=status,  # type: ignore[arg-type]
        amount=Decimal(amount),
        currency="EUR",
        description="BAR",
    )


def test_vanished_pending_is_removed_unless_corrected(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    bank = _FlakyBank()
    monkeypatch.setattr("app.ingestion.runner.connector_for", lambda source, today, **_: bank)
    source = AccountSource(provider="mock", institution="Banca", display_name="Finta")
    db.add(source)
    db.commit()

    bank.transactions = [
        _ptx("P-1", "-3.00"),
        _ptx("P-2", "-7.00"),
        _ptx("B-0", "-1.00", "booked", DAY - timedelta(days=2)),
    ]
    run_sync(db, source, today=DAY)
    corrected = db.scalar(select(Transaction).where(Transaction.external_id == "P-2"))
    assert corrected is not None
    update_transaction(db, corrected, TransactionUpdate(notes="tenere"))
    db.commit()

    bank.transactions = [
        _ptx("B-0", "-1.00", "booked", DAY - timedelta(days=2))
    ]  # P-1 e P-2 annullati
    summary = run_sync(db, source, today=DAY)
    job = next(j for j in summary.jobs if j.job == "transactions")
    assert job.details.get("removed_pending") == 1
    assert db.scalar(select(Transaction).where(Transaction.external_id == "P-1")) is None
    assert db.scalar(select(Transaction).where(Transaction.external_id == "P-2")) is not None


def test_failed_sync_is_logged_and_rolled_back(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Broken(_FlakyBank):
        def get_transactions(
            self, account_external_id: str, since: date
        ) -> list[ProviderTransaction]:
            raise ConnectionError("timeout verso IT00X0000000000000000000000")

    monkeypatch.setattr("app.ingestion.runner.connector_for", lambda source, today, **_: Broken())
    source = AccountSource(provider="mock", institution="Banca", display_name="Rotta")
    db.add(source)
    db.commit()

    summary = run_sync(db, source, today=DAY)
    assert summary.status == "error"
    db.refresh(source)
    assert source.status == "error"
    assert db.scalar(select(func.count()).select_from(Account)) == 0  # niente a metà
    log = db.scalar(select(SyncLog).where(SyncLog.source_id == source.id))
    assert log is not None
    assert (log.job, log.status) == ("transactions", "error")
    assert log.error_message is not None
    assert "ConnectionError" in log.error_message
    assert "IT00X0000000000000000000000" not in log.error_message  # IBAN mascherato
    assert log.error_code == "unexpected"


# --- Broker -----------------------------------------------------------------------------------


def test_broker_sync_builds_portfolio_and_is_idempotent(db: Session) -> None:
    source = _source(db, "mock:trading212")
    first = run_sync(db, source, today=DAY)
    assert first.status == "success"
    orders = db.scalar(select(func.count()).select_from(InvestmentOrder))
    assert orders is not None
    assert orders > 10

    run_sync(db, source, today=DAY)
    assert db.scalar(select(func.count()).select_from(InvestmentOrder)) == orders

    positions = db.scalars(select(Position)).all()
    assert {p.ticker for p in positions} >= {"VWCE"}
    for p in positions:
        assert p.market_value_eur - p.cost_basis_eur == p.unrealized_pl_eur
    assert (db.scalar(select(func.count()).select_from(PortfolioCashSnapshot)) or 0) >= 1

    broker = db.scalar(select(Account).where(Account.type == "broker"))
    assert broker is not None
    balance = db.scalar(select(Balance).where(Balance.account_id == broker.id))
    assert balance is not None
    assert balance.balance > 0


# --- Rimozione dei dati di prova ------------------------------------------------------------------


def test_remove_mock_data_keeps_everything_else(db: Session) -> None:
    manual = AccountSource(provider="manual", institution="CA", display_name="Manuale")
    db.add(manual)
    db.flush()
    db.add(Account(source_id=manual.id, external_id="m", name="Carta", type="credit_card",
                   currency="EUR", institution="CA"))  # fmt: skip
    for source in ensure_mock_sources(db):
        run_sync(db, source, today=DAY)

    report = remove_mock_data(db)
    db.commit()
    assert report.sources == 3
    assert report.transactions > 500
    assert _count(db) == 0
    assert db.scalar(select(func.count()).select_from(AccountSource)) == 1
    assert db.scalar(select(func.count()).select_from(Account)) == 1
    assert db.scalar(select(func.count()).select_from(SyncLog)) == 0
    # I merchant riconosciuti dai dati di prova se ne vanno con loro.
    assert report.merchants > 5
    assert (
        db.scalar(select(func.count()).select_from(Merchant).where(Merchant.origin == "auto")) == 0
    )
