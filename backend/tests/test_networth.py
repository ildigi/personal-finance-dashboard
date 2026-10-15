from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountSource,
    Balance,
    InvestmentCashFlow,
    NetWorthSnapshot,
    Portfolio,
)
from app.services.networth import net_worth_overview, record_snapshot
from tests.conftest import make_synced_transaction

TODAY = date(2026, 10, 6)


def _balance(db: Session, account: Account, day: date, amount: str, kind: str = "booked") -> None:
    db.add(
        Balance(
            account_id=account.id,
            as_of=day,
            balance=Decimal(amount),
            currency="EUR",
            balance_type=kind,
            source="provider",
        )
    )
    db.commit()


def _broker(db: Session, source: AccountSource) -> tuple[Account, Portfolio]:
    broker = Account(
        source_id=source.id,
        external_id="broker-1",
        name="Broker",
        type="broker",
        currency="EUR",
        institution="Broker",
    )
    db.add(broker)
    db.flush()
    portfolio = Portfolio(account_id=broker.id, name="Broker", base_currency="EUR")
    db.add(portfolio)
    db.commit()
    return broker, portfolio


def _deposit(db: Session, portfolio: Portfolio, day: date, amount: str) -> None:
    db.add(
        InvestmentCashFlow(
            portfolio_id=portfolio.id,
            external_id=f"dep-{day.isoformat()}",
            type="deposit",
            occurred_at=datetime(day.year, day.month, day.day, 12, tzinfo=UTC),
            amount=Decimal(amount),
            currency="EUR",
            amount_eur=Decimal(amount),
        )
    )
    db.commit()


def test_bank_history_is_rebuilt_from_the_balance_and_transactions(
    db: Session, account: Account
) -> None:
    make_synced_transaction(db, account, amount="-30.00", booking_date=date(2026, 10, 1))
    make_synced_transaction(db, account, amount="500.00", booking_date=date(2026, 10, 3))
    make_synced_transaction(db, account, amount="-20.00", booking_date=date(2026, 10, 5))
    _balance(db, account, date(2026, 10, 4), "1000.00")
    # Disponibile più recente: è il saldo di oggi (comprende i pagamenti in sospeso).
    _balance(db, account, TODAY, "975.00", kind="available")

    ov = net_worth_overview(db, TODAY, None)
    by_day = {p.date: p for p in ov.series}
    assert ov.series[0].date == date(2026, 10, 1)  # primo movimento noto
    assert by_day[date(2026, 10, 4)].cash_eur == Decimal("1000.00")  # = saldo salvato
    assert by_day[date(2026, 10, 3)].cash_eur == Decimal("1000.00")
    assert by_day[date(2026, 10, 2)].cash_eur == Decimal("500.00")
    assert by_day[date(2026, 10, 1)].cash_eur == Decimal("500.00")
    assert by_day[date(2026, 10, 5)].cash_eur == Decimal("980.00")  # dopo il saldo: in avanti
    assert ov.total_eur == ov.series[-1].total_eur == Decimal("975.00")
    assert not any(p.partial or p.estimated for p in ov.series)
    assert ov.accounts[0].history_from == date(2026, 10, 1)


def test_broker_value_is_estimated_with_deposits_before_the_first_saved_value(
    db: Session, account: Account, source: AccountSource
) -> None:
    broker, portfolio = _broker(db, source)
    _balance(db, account, TODAY, "100.00")
    make_synced_transaction(db, account, amount="-1.00", booking_date=date(2026, 9, 1))
    _deposit(db, portfolio, date(2026, 9, 10), "200.00")
    _balance(db, broker, date(2026, 10, 5), "230.00")
    _balance(db, broker, TODAY, "240.00")

    ov = net_worth_overview(db, TODAY, date(2026, 9, 1))
    by_day = {p.date: p for p in ov.series}
    assert by_day[date(2026, 9, 5)].investments_eur == Decimal("0.00")
    assert by_day[date(2026, 9, 20)].investments_eur == Decimal("200.00")
    assert by_day[date(2026, 9, 20)].estimated
    assert by_day[date(2026, 10, 5)].investments_eur == Decimal("230.00")
    assert not by_day[date(2026, 10, 5)].estimated
    assert ov.investments_eur == Decimal("240.00")
    assert ov.total_eur == Decimal("340.00")
    assert ov.complete_from == date(2026, 10, 5)
    # Somma delle parti = totale, giorno per giorno.
    assert all(p.cash_eur + p.investments_eur == p.total_eur for p in ov.series)
    # Con gli investimenti stimati il confronto del totale non regge; la liquidità sì.
    change = next(c for c in ov.changes if c.days == 30)
    assert change.delta_eur is None
    assert change.cash_delta_eur == Decimal("0.00")
    shares = {a.kind: a.share_pct for a in ov.accounts}
    assert shares == {"cash": 29.4, "investments": 70.6}


def test_days_before_a_bank_history_are_partial(
    db: Session, account: Account, source: AccountSource
) -> None:
    other = Account(
        source_id=source.id,
        external_id="acc-2",
        name="Secondo",
        type="checking",
        currency="EUR",
        institution="Altra banca",
    )
    db.add(other)
    db.commit()
    make_synced_transaction(db, account, amount="-5.00", booking_date=date(2026, 9, 1))
    make_synced_transaction(db, other, amount="-5.00", booking_date=date(2026, 9, 20))
    _balance(db, account, TODAY, "50.00")
    _balance(db, other, TODAY, "70.00")

    ov = net_worth_overview(db, TODAY, None)
    by_day = {p.date: p for p in ov.series}
    assert by_day[date(2026, 9, 10)].partial  # il secondo conto non ha ancora dati
    assert by_day[date(2026, 9, 10)].total_eur == Decimal("50.00")
    assert not by_day[date(2026, 9, 25)].partial
    assert ov.complete_from == date(2026, 9, 20)


def test_accounts_left_out_of_net_worth_are_ignored(db: Session, account: Account) -> None:
    _balance(db, account, TODAY, "50.00")
    account.include_in_net_worth = False
    db.commit()
    ov = net_worth_overview(db, TODAY, None)
    assert ov.total_eur == Decimal("0.00")
    assert ov.accounts == []


def test_daily_snapshot_is_saved_and_wins_over_the_reconstruction(
    db: Session, account: Account
) -> None:
    make_synced_transaction(db, account, amount="-10.00", booking_date=date(2026, 10, 1))
    _balance(db, account, date(2026, 10, 3), "90.00")
    snap = record_snapshot(db, date(2026, 10, 3))
    db.commit()
    assert snap is not None
    assert (snap.cash_total_eur, snap.net_worth_eur) == (Decimal("90.00"), Decimal("90.00"))
    assert snap.breakdown == {str(account.id): "90.00"}
    # Rifarla lo stesso giorno aggiorna la stessa riga.
    record_snapshot(db, date(2026, 10, 3))
    db.commit()
    assert len(db.scalars(select(NetWorthSnapshot)).all()) == 1

    snap.breakdown = {str(account.id): "95.00"}  # es. un movimento poi stornato
    db.commit()
    ov = net_worth_overview(db, TODAY, None)
    assert {p.date: p for p in ov.series}[date(2026, 10, 3)].cash_eur == Decimal("95.00")


def test_api(client: TestClient, db: Session, account: Account) -> None:
    _balance(db, account, date(2026, 10, 1), "12.34")
    body = client.get("/api/networth", params={"since": "2026-09-01"}).json()
    assert body["total_eur"] == "12.34"
    assert body["accounts"][0]["kind"] == "cash"
    assert body["series"][-1]["total_eur"] == "12.34"
