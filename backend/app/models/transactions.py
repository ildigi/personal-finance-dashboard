from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import (
    Base,
    Currency,
    IdMixin,
    Money,
    Rate,
    TimestampMixin,
    check_currency,
    check_in,
)
from app.models.enums import (
    ClassificationSource,
    OverrideField,
    TagSource,
    TransactionKind,
    TransactionStatus,
)

if TYPE_CHECKING:
    from app.models.merchants import Merchant


class Transaction(IdMixin, TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("account_id", "external_id"),
        ForeignKeyConstraint(
            ["subcategory_id", "category_id"],
            ["subcategories.id", "subcategories.category_id"],
            name="fk_transactions_subcategory_in_category",
        ),
        check_in("status", TransactionStatus),
        check_in("kind", TransactionKind),
        check_in("classification_source", ClassificationSource),
        check_currency("currency"),
        check_currency("original_currency"),
        CheckConstraint("transfer_pair_id <> id", name="transfer_pair_not_self"),
        CheckConstraint("refund_of_id <> id", name="refund_of_not_self"),
        Index("ix_transactions_account_id_booking_date", "account_id", "booking_date"),
        Index(
            "ix_transactions_description_fts",
            text("to_tsvector('simple'::regconfig, description_clean)"),
            postgresql_using="gin",
        ),
    )

    # --- Identità ---------------------------------------------------------------
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    external_id: Mapped[str | None]
    dedupe_hash: Mapped[str] = mapped_column(index=True)

    # --- Date -------------------------------------------------------------------
    booking_date: Mapped[date] = mapped_column(Date, index=True)
    value_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(server_default=TransactionStatus.BOOKED.value)

    # --- Importi (con segno: negativo = uscita) ------------------------------------
    amount: Mapped[Money]
    currency: Mapped[Currency]
    amount_eur: Mapped[Money]
    original_amount: Mapped[Money | None]
    original_currency: Mapped[Currency | None]
    fx_rate: Mapped[Rate | None]

    # --- Testo ------------------------------------------------------------------
    description_raw: Mapped[str]
    description_clean: Mapped[str]
    counterparty_name: Mapped[str | None]
    counterparty_iban: Mapped[str | None]
    provider_category: Mapped[str | None]
    mcc: Mapped[str | None]

    # --- Classificazione ---------------------------------------------------------
    merchant_id: Mapped[int | None] = mapped_column(
        ForeignKey("merchants.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[str] = mapped_column(index=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), index=True
    )
    subcategory_id: Mapped[int | None] = mapped_column(BigInteger)
    income_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("income_classifications.id", ondelete="RESTRICT")
    )
    classification_source: Mapped[str] = mapped_column(
        server_default=ClassificationSource.NONE.value
    )
    rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("transaction_rules.id", ondelete="SET NULL")
    )
    # Spiegazione leggibile del perché (es. "MCC 5411", "Abbinato a un tuo conto").
    classification_note: Mapped[str | None]

    # --- Collegamenti -------------------------------------------------------------
    transfer_pair_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL")
    )
    recurring_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_transactions.id", ondelete="SET NULL"), index=True
    )
    refund_of_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL")
    )

    # --- Altro --------------------------------------------------------------------
    notes: Mapped[str | None]
    is_manual: Mapped[bool] = mapped_column(server_default=text("false"))
    raw: Mapped[dict[str, Any] | None]

    tags: Mapped[list[Tag]] = relationship(
        secondary="transaction_tags", viewonly=True, order_by="Tag.name"
    )
    merchant: Mapped[Merchant | None] = relationship(viewonly=True)

    @property
    def merchant_name(self) -> str | None:
        return self.merchant.name if self.merchant is not None else None

    @property
    def is_outflow(self) -> bool:
        return self.amount < Decimal(0)


class Tag(IdMixin, TimestampMixin, Base):
    __tablename__ = "tags"

    name: Mapped[str] = mapped_column(unique=True)
    color: Mapped[str | None]


class TransactionTag(TimestampMixin, Base):
    __tablename__ = "transaction_tags"
    __table_args__ = (check_in("source", TagSource),)

    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    source: Mapped[str] = mapped_column(server_default=TagSource.MANUAL.value)


class ManualOverride(IdMixin, TimestampMixin, Base):
    """Correzione manuale di un campo: sopravvive a ogni sync e riclassificazione."""

    __tablename__ = "manual_overrides"
    __table_args__ = (
        UniqueConstraint("transaction_id", "field"),
        check_in("field", OverrideField),
    )

    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"))
    field: Mapped[str]
    # Valori serializzati come testo (id o stringhe); NULL = campo svuotato.
    old_value: Mapped[str | None]
    new_value: Mapped[str | None]
