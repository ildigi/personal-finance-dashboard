"""Patrimonio netto (SPEC §16, Fase 9)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

NetWorthKind = Literal["cash", "investments"]


class NetWorthAccount(ApiModel):
    account_id: int
    name: str
    institution: str
    type: str
    kind: NetWorthKind
    currency: str
    value_eur: Decimal | None = Field(description="None se il conto non ha ancora un saldo")
    as_of: date | None
    share_pct: float | None = Field(description="Quota del patrimonio (solo valori positivi)")
    #: Da quando lo storico del conto è completo (primo movimento noto o primo saldo).
    history_from: date | None


class NetWorthPoint(ApiModel):
    date: date
    cash_eur: Decimal
    investments_eur: Decimal
    total_eur: Decimal
    #: Qualche conto non ha ancora dati in quel giorno: il totale non lo comprende.
    partial: bool
    #: Il valore degli investimenti è stimato col capitale versato (prima del collegamento).
    estimated: bool


class NetWorthChange(ApiModel):
    days: int
    from_date: date
    delta_eur: Decimal | None = Field(
        description="None se uno dei due giorni è parziale o stimato: il confronto non regge"
    )
    delta_pct: float | None
    #: Variazione della sola liquidità: regge anche quando gli investimenti sono stimati.
    cash_delta_eur: Decimal | None


class NetWorthOverview(ApiModel):
    as_of: date
    total_eur: Decimal
    cash_eur: Decimal
    investments_eur: Decimal
    accounts: list[NetWorthAccount]
    series: list[NetWorthPoint]
    changes: list[NetWorthChange]
    #: Primo giorno in cui tutti i conti hanno dati reali (nessuna stima, nessun buco).
    complete_from: date | None
