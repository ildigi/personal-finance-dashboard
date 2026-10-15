from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, LargeBinary, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Currency, IdMixin, Money, TimestampMixin, check_currency, check_in
from app.models.enums import AccountType, BalanceType, Provider, SourceStatus


class AccountSource(IdMixin, TimestampMixin, Base):
    """Una connessione a un provider: sessione Enable Banking, chiave Trading 212, mock, manuale."""

    __tablename__ = "account_sources"
    __table_args__ = (
        check_in("provider", Provider),
        check_in("status", SourceStatus),
    )

    provider: Mapped[str]
    institution: Mapped[str]
    display_name: Mapped[str]
    status: Mapped[str] = mapped_column(server_default=SourceStatus.ACTIVE.value)
    consent_expires_at: Mapped[datetime | None]
    # Riferimento al segreto (es. nome del file in secrets/), mai il segreto stesso.
    credentials_ref: Mapped[str | None]
    # Token/sessione del provider cifrati con Fernet.
    session_data_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    last_sync_at: Mapped[datetime | None]

    accounts: Mapped[list[Account]] = relationship(back_populates="source")


class Account(IdMixin, TimestampMixin, Base):
    """Un conto o una carta di credito (le carte di debito stanno sul conto)."""

    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id"),
        check_in("type", AccountType),
        check_currency("currency"),
    )

    source_id: Mapped[int] = mapped_column(ForeignKey("account_sources.id", ondelete="RESTRICT"))
    external_id: Mapped[str]
    name: Mapped[str]
    type: Mapped[str]
    currency: Mapped[Currency]
    iban: Mapped[str | None]
    institution: Mapped[str]
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    include_in_net_worth: Mapped[bool] = mapped_column(server_default=text("true"))
    color: Mapped[str | None]

    source: Mapped[AccountSource] = relationship(back_populates="accounts")


class Balance(IdMixin, TimestampMixin, Base):
    """Saldo storico di un conto in una data."""

    __tablename__ = "balances"
    __table_args__ = (
        UniqueConstraint("account_id", "as_of", "balance_type"),
        check_in("balance_type", BalanceType),
        check_currency("currency"),
    )

    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    as_of: Mapped[date] = mapped_column(Date)
    balance: Mapped[Money]
    currency: Mapped[Currency]
    balance_type: Mapped[str]
    # Da dove arriva il saldo: provider, calcolato, manuale.
    source: Mapped[str]
