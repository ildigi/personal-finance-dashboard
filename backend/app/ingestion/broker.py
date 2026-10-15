"""Ingestione del broker: snapshot di posizioni e liquidità, storico idempotente."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.ingestion.bank import JobStats
from app.integrations.base import BrokerConnector
from app.models import (
    Account,
    AccountSource,
    Balance,
    Dividend,
    InvestmentCashFlow,
    InvestmentOrder,
    Pie,
    PieInstrument,
    Portfolio,
    PortfolioCashSnapshot,
    Position,
)
from app.services.fx import rate_to_eur

CENT = Decimal("0.01")
# Al massimo un'istantanea salvata per quarto d'ora: quelle successive la sostituiscono.
SNAPSHOT_SLOT = timedelta(minutes=15)


def _eur(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def ensure_portfolio(
    session: Session, source: AccountSource, connector: BrokerConnector
) -> tuple[Portfolio, JobStats]:
    info = connector.get_account()
    stats = JobStats(fetched=1)
    account = session.scalar(
        select(Account).where(
            Account.source_id == source.id, Account.external_id == info.external_id
        )
    )
    if account is None:
        account = Account(
            source_id=source.id,
            external_id=info.external_id,
            name=info.name,
            type="broker",
            currency=info.currency,
            institution=info.institution,
        )
        session.add(account)
        session.flush()
        stats.created += 1
    portfolio = session.scalar(select(Portfolio).where(Portfolio.account_id == account.id))
    if portfolio is None:
        portfolio = Portfolio(account_id=account.id, name=info.name, base_currency=info.currency)
        session.add(portfolio)
        session.flush()
    return portfolio, stats


def _slot(at: datetime) -> int:
    return int(at.astimezone(UTC).timestamp() // SNAPSHOT_SLOT.total_seconds())


def _make_room(session: Session, portfolio: Portfolio, snapshot_at: datetime) -> bool:
    """Toglie l'ultima istantanea se è nello stesso quarto d'ora di `snapshot_at`.
    Falso se ce n'è già una uguale o più recente (niente da fare)."""
    latest = session.scalar(
        select(PortfolioCashSnapshot)
        .where(PortfolioCashSnapshot.portfolio_id == portfolio.id)
        .order_by(PortfolioCashSnapshot.snapshot_at.desc())
        .limit(1)
    )
    if latest is None:
        return True
    if latest.snapshot_at >= snapshot_at:
        return False
    if _slot(latest.snapshot_at) == _slot(snapshot_at):
        session.execute(
            delete(Position).where(
                Position.portfolio_id == portfolio.id,
                Position.snapshot_at == latest.snapshot_at,
            )
        )
        session.delete(latest)
        session.flush()
    return True


def snapshot_portfolio(
    session: Session,
    portfolio: Portfolio,
    connector: BrokerConnector,
    *,
    snapshot_at: datetime,
    today: date,
) -> JobStats:
    """Fotografia di posizioni e liquidità. Al massimo una per quarto d'ora: una nuova nello
    stesso quarto d'ora sostituisce la precedente, così l'aggiornamento continuo non riempie
    il database ma lo storico tiene un punto ogni 15 minuti."""
    stats = JobStats()
    if not _make_room(session, portfolio, snapshot_at):
        return stats

    positions = connector.get_positions()
    stats.fetched = len(positions)
    market_value = Decimal(0)
    for p in positions:
        fx = (
            p.fx_rate
            if p.fx_rate is not None
            else rate_to_eur(session, p.instrument_currency, today)
        )
        cost = (
            p.cost_basis_eur
            if p.cost_basis_eur is not None
            else _eur(p.quantity * p.avg_price * fx)
        )
        value = (
            p.market_value_eur
            if p.market_value_eur is not None
            else _eur(p.quantity * p.current_price * fx)
        )
        market_value += value
        session.add(
            Position(
                portfolio_id=portfolio.id,
                snapshot_at=snapshot_at,
                ticker=p.ticker,
                isin=p.isin,
                name=p.name,
                quantity=p.quantity,
                avg_price=p.avg_price,
                current_price=p.current_price,
                instrument_currency=p.instrument_currency,
                fx_rate=fx,
                cost_basis_eur=cost,
                market_value_eur=value,
                unrealized_pl_eur=value - cost,
            )
        )
        stats.created += 1

    cash = connector.get_cash()
    session.add(
        PortfolioCashSnapshot(
            portfolio_id=portfolio.id,
            snapshot_at=snapshot_at,
            currency=cash.currency,
            free=cash.free,
            invested=cash.invested,
            total=cash.total,
            unrealized_pl=cash.unrealized_pl,
            raw=cash.raw or None,
        )
    )

    # Valore del conto come saldo del giorno: alimenterà il patrimonio netto.
    total_value = _eur(cash.free + market_value)
    balance = session.scalar(
        select(Balance).where(
            Balance.account_id == portfolio.account_id,
            Balance.as_of == today,
            Balance.balance_type == "booked",
        )
    )
    if balance is None:
        session.add(
            Balance(
                account_id=portfolio.account_id,
                as_of=today,
                balance=total_value,
                currency="EUR",
                balance_type="booked",
                source="provider",
            )
        )
    else:
        balance.balance = total_value
    session.flush()
    return stats


def sync_orders(
    session: Session, portfolio: Portfolio, connector: BrokerConnector, since: date
) -> JobStats:
    orders = connector.get_orders(since)
    stats = JobStats(fetched=len(orders))
    known = set(
        session.scalars(
            select(InvestmentOrder.external_id).where(InvestmentOrder.portfolio_id == portfolio.id)
        )
    )
    for o in orders:
        if o.external_id in known:
            continue
        session.add(
            InvestmentOrder(
                portfolio_id=portfolio.id,
                external_id=o.external_id,
                executed_at=o.executed_at,
                ticker=o.ticker,
                isin=o.isin,
                side=o.side,
                quantity=o.quantity,
                fill_price=o.fill_price,
                instrument_currency=o.instrument_currency,
                fx_rate=o.fx_rate,
                value_eur=o.value_eur,
                fees_eur=o.fees_eur,
                taxes_eur=o.taxes_eur,
                raw=o.raw or None,
            )
        )
        stats.created += 1
    session.flush()
    return stats


def sync_dividends(
    session: Session, portfolio: Portfolio, connector: BrokerConnector, since: date
) -> JobStats:
    dividends = connector.get_dividends(since)
    stats = JobStats(fetched=len(dividends))
    known = set(session.scalars(select(Dividend.external_id)))
    for d in dividends:
        if d.external_id in known:
            continue
        session.add(
            Dividend(
                portfolio_id=portfolio.id,
                external_id=d.external_id,
                ticker=d.ticker,
                paid_on=d.paid_on,
                quantity=d.quantity,
                gross_per_share=d.gross_per_share,
                amount=d.amount,
                currency=d.currency,
                amount_eur=d.amount_eur,
                withholding_tax=d.withholding_tax,
            )
        )
        stats.created += 1
    session.flush()
    return stats


def sync_pies(
    session: Session, portfolio: Portfolio, connector: BrokerConnector, *, synced_at: datetime
) -> JobStats:
    """Le Pie rispecchiano lo stato attuale: si aggiornano, quelle sparite si eliminano."""
    pies = connector.get_pies()
    stats = JobStats(fetched=len(pies))
    existing = {
        p.external_id: p
        for p in session.scalars(select(Pie).where(Pie.portfolio_id == portfolio.id))
    }
    for data in pies:
        pie = existing.pop(data.external_id, None)
        if pie is None:
            pie = Pie(portfolio_id=portfolio.id, external_id=data.external_id)
            session.add(pie)
            stats.created += 1
        else:
            stats.updated += 1
        pie.name = data.name
        pie.icon = data.icon
        pie.goal_eur = data.goal_eur
        pie.dividend_action = data.dividend_action
        pie.cash_eur = data.cash_eur
        pie.invested_eur = data.invested_eur
        pie.value_eur = data.value_eur
        pie.result_eur = data.result_eur
        pie.dividends_gained_eur = data.dividends_gained_eur
        pie.synced_at = synced_at
        pie.raw = data.raw or None
        session.flush()
        current = {
            i.ticker: i
            for i in session.scalars(select(PieInstrument).where(PieInstrument.pie_id == pie.id))
        }
        for item in data.instruments:
            row = current.pop(item.ticker, None)
            if row is None:
                row = PieInstrument(pie_id=pie.id, ticker=item.ticker)
                session.add(row)
            row.expected_share = item.expected_share
            row.current_share = item.current_share
            row.owned_quantity = item.owned_quantity
            row.invested_eur = item.invested_eur
            row.value_eur = item.value_eur
            row.result_eur = item.result_eur
        for gone in current.values():
            session.delete(gone)
    for gone_pie in existing.values():
        session.delete(gone_pie)
    session.flush()
    return stats


def sync_cash_flows(
    session: Session, portfolio: Portfolio, connector: BrokerConnector, since: date
) -> JobStats:
    flows = connector.get_cash_flows(since)
    stats = JobStats(fetched=len(flows))
    known = set(
        session.scalars(
            select(InvestmentCashFlow.external_id).where(
                InvestmentCashFlow.portfolio_id == portfolio.id
            )
        )
    )
    for f in flows:
        if f.external_id in known:
            continue
        session.add(
            InvestmentCashFlow(
                portfolio_id=portfolio.id,
                external_id=f.external_id,
                type=f.type,
                occurred_at=f.occurred_at,
                amount=f.amount,
                currency=f.currency,
                amount_eur=f.amount_eur,
                raw=f.raw or None,
            )
        )
        stats.created += 1
    session.flush()
    return stats
