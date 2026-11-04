"""Log di sincronizzazione, snapshot del patrimonio, tassi di cambio."""

from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import Date, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

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
from app.models.enums import SyncJob, SyncStatus


class SyncLog(IdMixin, TimestampMixin, Base):
    __tablename__ = "sync_logs"
    __table_args__ = (
        check_in("job", SyncJob),
        check_in("status", SyncStatus),
    )

    source_id: Mapped[int] = mapped_column(
        ForeignKey("account_sources.id", ondelete="CASCADE"), index=True
    )
    job: Mapped[str]
    started_at: Mapped[dt.datetime] = mapped_column(server_default=func.now())
    finished_at: Mapped[dt.datetime | None]
    status: Mapped[str]
    items_fetched: Mapped[int | None]
    items_created: Mapped[int | None]
    items_updated: Mapped[int | None]
    # Mai dati sensibili: solo tipo di errore e messaggio sintetico (per chi legge i log).
    error_message: Mapped[str | None]
    # Lo stesso errore per l'interfaccia: codice di `app.core.messages` e parametri.
    error_code: Mapped[str | None]
    error_params: Mapped[dict[str, Any] | None]


class NetWorthSnapshot(IdMixin, TimestampMixin, Base):
    __tablename__ = "net_worth_snapshots"

    snapshot_date: Mapped[dt.date] = mapped_column(Date, unique=True)
    cash_total_eur: Mapped[Money]
    investments_total_eur: Mapped[Money]
    net_worth_eur: Mapped[Money]
    # Valori per conto: {"<account_id>": "1234.56", ...}
    breakdown: Mapped[dict[str, Any]]


class FxRate(TimestampMixin, Base):
    """Tasso di cambio giornaliero: 1 unità di `currency` = `rate_to_eur` EUR."""

    __tablename__ = "fx_rates"
    __table_args__ = (check_currency("currency"),)

    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    currency: Mapped[Currency] = mapped_column(primary_key=True)
    rate_to_eur: Mapped[Rate]
    source: Mapped[str]


class AppSetting(TimestampMixin, Base):
    """Impostazioni dell'installazione salvate nel database, es. `data_locale`: la lingua in
    cui il seed ha scritto categorie e regole (ADR 0006)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[str]
