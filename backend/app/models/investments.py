"""Portafoglio Trading 212: snapshot di posizioni e liquidità, ordini, flussi, dividendi."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import (
    Base,
    Currency,
    IdMixin,
    Money,
    Quantity,
    Rate,
    TimestampMixin,
    UnitPrice,
    check_currency,
    check_in,
)
from app.models.enums import CashFlowType, OrderSide


class Portfolio(IdMixin, TimestampMixin, Base):
    __tablename__ = "portfolios"
    __table_args__ = (check_currency("base_currency"),)

    # Conto di tipo `broker`.
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), unique=True
    )
    name: Mapped[str]
    base_currency: Mapped[Currency]
    # Data di inizio dei rendimenti: lo storico precedente si ignora (SPEC §13).
    tracking_start: Mapped[date | None] = mapped_column(Date)


class Position(IdMixin, TimestampMixin, Base):
    """Una riga per strumento per snapshot."""

    __tablename__ = "positions"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "snapshot_at", "ticker"),
        check_currency("instrument_currency"),
        CheckConstraint("quantity >= 0", name="quantity_non_negative"),
    )

    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    snapshot_at: Mapped[datetime]
    ticker: Mapped[str]
    isin: Mapped[str | None]
    name: Mapped[str | None]
    quantity: Mapped[Quantity]
    avg_price: Mapped[UnitPrice]
    current_price: Mapped[UnitPrice]
    instrument_currency: Mapped[Currency]
    fx_rate: Mapped[Rate | None]
    cost_basis_eur: Mapped[Money]
    market_value_eur: Mapped[Money]
    unrealized_pl_eur: Mapped[Money]


class PortfolioCashSnapshot(IdMixin, TimestampMixin, Base):
    """Liquidità del broker in un istante: libera, investita, totale."""

    __tablename__ = "portfolio_cash_snapshots"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "snapshot_at"),
        check_currency("currency"),
    )

    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    snapshot_at: Mapped[datetime]
    currency: Mapped[Currency]
    free: Mapped[Money]
    invested: Mapped[Money]
    total: Mapped[Money]
    unrealized_pl: Mapped[Money | None]
    raw: Mapped[dict[str, Any] | None]


class InvestmentOrder(IdMixin, TimestampMixin, Base):
    """Ordine eseguito (storico), base per il P/L realizzato."""

    __tablename__ = "investment_orders"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "external_id"),
        check_in("side", OrderSide),
        check_currency("instrument_currency"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
    )

    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    external_id: Mapped[str]
    executed_at: Mapped[datetime] = mapped_column(index=True)
    ticker: Mapped[str]
    isin: Mapped[str | None]
    side: Mapped[str]
    quantity: Mapped[Quantity]
    fill_price: Mapped[UnitPrice]
    instrument_currency: Mapped[Currency]
    fx_rate: Mapped[Rate | None]
    value_eur: Mapped[Money]
    fees_eur: Mapped[Money | None]
    taxes_eur: Mapped[Money | None]
    raw: Mapped[dict[str, Any] | None]


class InvestmentCashFlow(IdMixin, TimestampMixin, Base):
    """Deposito o prelievo sul conto broker."""

    __tablename__ = "investment_cash_flows"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "external_id"),
        check_in("type", CashFlowType),
        check_currency("currency"),
        CheckConstraint("amount > 0", name="amount_positive"),
    )

    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    external_id: Mapped[str]
    type: Mapped[str]
    occurred_at: Mapped[datetime] = mapped_column(index=True)
    # Sempre positivo: il verso è dato da `type`.
    amount: Mapped[Money]
    currency: Mapped[Currency]
    amount_eur: Mapped[Money]
    # Movimento bancario corrispondente (`investment_transfer`), se abbinato.
    transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL")
    )
    raw: Mapped[dict[str, Any] | None]


class Dividend(IdMixin, TimestampMixin, Base):
    __tablename__ = "dividends"
    __table_args__ = (check_currency("currency"),)

    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    external_id: Mapped[str] = mapped_column(unique=True)
    ticker: Mapped[str]
    paid_on: Mapped[date] = mapped_column(Date, index=True)
    quantity: Mapped[Quantity | None]
    gross_per_share: Mapped[UnitPrice | None]
    amount: Mapped[Money]
    currency: Mapped[Currency]
    amount_eur: Mapped[Money]
    withholding_tax: Mapped[Money | None]


class Pie(IdMixin, TimestampMixin, Base):
    """Stato attuale di una Pie (Trading 212), sostituito a ogni sincronizzazione."""

    __tablename__ = "pies"
    __table_args__ = (UniqueConstraint("portfolio_id", "external_id"),)

    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"))
    external_id: Mapped[str]
    name: Mapped[str]
    icon: Mapped[str | None]
    goal_eur: Mapped[Money | None]
    dividend_action: Mapped[str | None]
    # Liquidità nella Pie non ancora investita.
    cash_eur: Mapped[Money]
    invested_eur: Mapped[Money]
    value_eur: Mapped[Money]
    result_eur: Mapped[Money]
    dividends_gained_eur: Mapped[Money | None]
    synced_at: Mapped[datetime]
    raw: Mapped[dict[str, Any] | None]


class PieInstrument(IdMixin, TimestampMixin, Base):
    __tablename__ = "pie_instruments"
    __table_args__ = (
        UniqueConstraint("pie_id", "ticker"),
        CheckConstraint("expected_share BETWEEN 0 AND 1", name="expected_share_range"),
    )

    pie_id: Mapped[int] = mapped_column(ForeignKey("pies.id", ondelete="CASCADE"))
    ticker: Mapped[str]
    # Quote 0–1: obiettivo impostato nella Pie e peso attuale.
    expected_share: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    current_share: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    owned_quantity: Mapped[Quantity]
    invested_eur: Mapped[Money]
    value_eur: Mapped[Money]
    result_eur: Mapped[Money]
