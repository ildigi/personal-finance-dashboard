"""Regole di classificazione, budget e ricorrenze."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, Money, TimestampMixin, check_in
from app.models.enums import (
    BudgetPeriod,
    Direction,
    Frequency,
    RecurringStatus,
    RuleOrigin,
    TransactionKind,
)


class TransactionRule(IdMixin, TimestampMixin, Base):
    """Regola di classificazione. Numero di priorità più basso = valutata prima.

    `conditions` (AND): description_contains, description_regex, merchant_id,
    counterparty_iban, account_id, amount_min, amount_max, direction, mcc.
    `actions`: category_id, subcategory_id, kind, income_type_id, merchant_id, tag_ids.
    """

    __tablename__ = "transaction_rules"
    __table_args__ = (
        check_in("origin", RuleOrigin),
        CheckConstraint("jsonb_typeof(conditions) = 'object'", name="conditions_is_object"),
        CheckConstraint("jsonb_typeof(actions) = 'object'", name="actions_is_object"),
    )

    name: Mapped[str]
    # Solo per le regole di sistema: chiave stabile del seed (database/seeds/rules.yaml).
    code: Mapped[str | None] = mapped_column(unique=True)
    priority: Mapped[int] = mapped_column(server_default=text("100"), index=True)
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    origin: Mapped[str]
    conditions: Mapped[dict[str, Any]]
    actions: Mapped[dict[str, Any]]
    match_count: Mapped[int] = mapped_column(server_default=text("0"))
    last_matched_at: Mapped[datetime | None]


class Budget(IdMixin, TimestampMixin, Base):
    """Una versione del budget di una categoria (o sottocategoria), valida da `valid_from`
    (primo del mese) a `valid_to` (fine mese, nullo = ancora in corso). Cambiare l'importo
    chiude la versione e ne apre una nuova: lo storico resta confrontato con il budget di allora.
    """

    __tablename__ = "budgets"
    __table_args__ = (
        # Al massimo un budget aperto per categoria/sottocategoria.
        Index(
            "uq_budgets_open_line",
            "category_id",
            text("coalesce(subcategory_id, 0)"),
            unique=True,
            postgresql_where=text("valid_to IS NULL"),
        ),
        ForeignKeyConstraint(
            ["subcategory_id", "category_id"],
            ["subcategories.id", "subcategories.category_id"],
            name="fk_budgets_subcategory_in_category",
        ),
        check_in("period", BudgetPeriod),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("alert_threshold_pct BETWEEN 1 AND 100", name="alert_threshold_pct_range"),
        CheckConstraint("valid_to IS NULL OR valid_to >= valid_from", name="valid_range"),
    )

    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    subcategory_id: Mapped[int | None] = mapped_column(BigInteger)
    period: Mapped[str] = mapped_column(server_default=BudgetPeriod.MONTHLY.value)
    amount: Mapped[Money]
    valid_from: Mapped[date] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    alert_threshold_pct: Mapped[int] = mapped_column(server_default=text("80"))
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))


class RecurringTransaction(IdMixin, TimestampMixin, Base):
    """Serie periodica (abbonamento, affitto, stipendio...). Le proposte (`suggested`) le crea
    il rilevamento automatico; confermate, rifiutate e terminate le decidi tu.

    `match_key` identifica la controparte (`m:<merchant>`, `iban:<iban>`, `cp:<nome>`,
    `d:<descrizione>`): con verso e importo (± tolleranza) decide quali movimenti ne fanno parte.
    """

    __tablename__ = "recurring_transactions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["subcategory_id", "category_id"],
            ["subcategories.id", "subcategories.category_id"],
            name="fk_recurring_transactions_subcategory_in_category",
        ),
        check_in("direction", Direction),
        check_in("kind", TransactionKind),
        check_in("frequency", Frequency),
        check_in("status", RecurringStatus),
        CheckConstraint(
            "frequency <> 'custom' OR interval_days IS NOT NULL", name="custom_needs_interval"
        ),
        CheckConstraint("interval_days IS NULL OR interval_days > 0", name="interval_positive"),
        CheckConstraint(
            "confidence IS NULL OR confidence BETWEEN 0 AND 1", name="confidence_range"
        ),
        CheckConstraint("amount_tolerance_pct >= 0", name="tolerance_non_negative"),
    )

    name: Mapped[str]
    match_key: Mapped[str] = mapped_column(index=True)
    direction: Mapped[str]
    kind: Mapped[str]
    merchant_id: Mapped[int | None] = mapped_column(ForeignKey("merchants.id", ondelete="SET NULL"))
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT")
    )
    subcategory_id: Mapped[int | None] = mapped_column(BigInteger)
    frequency: Mapped[str]
    interval_days: Mapped[int | None]
    expected_amount: Mapped[Money]
    amount_tolerance_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default=text("10"))
    next_expected_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(server_default=RecurringStatus.SUGGESTED.value)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    last_seen_date: Mapped[date | None] = mapped_column(Date)
