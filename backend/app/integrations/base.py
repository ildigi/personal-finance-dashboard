"""Interfacce comuni dei connettori. SOLO LETTURA, per progetto (SPEC §8, ADR 0004).

Ogni connettore (mock, Enable Banking, Trading 212) traduce i dati del provider
in queste strutture normalizzate. La pipeline di ingestione lavora solo su di esse,
quindi i dati di prova e quelli veri seguono esattamente lo stesso percorso.

Nessun metodo di questi protocolli modifica qualcosa presso il provider: un test
verifica che i connettori espongano solo metodi `list_*` / `get_*`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Protocol

AccountKind = Literal["checking", "savings", "card", "credit_card", "broker"]
TxStatus = Literal["pending", "booked"]


# --- Banca ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProviderAccount:
    external_id: str
    name: str
    type: AccountKind
    currency: str
    institution: str
    iban: str | None = None


@dataclass(frozen=True)
class ProviderBalance:
    account_external_id: str
    as_of: date
    amount: Decimal
    currency: str
    balance_type: Literal["booked", "available"] = "booked"


@dataclass(frozen=True)
class ProviderTransaction:
    """Un movimento come lo fornisce il provider (importo con segno: negativo = uscita)."""

    account_external_id: str
    external_id: str | None
    booking_date: date
    status: TxStatus
    amount: Decimal
    currency: str
    description: str
    value_date: date | None = None
    original_amount: Decimal | None = None
    original_currency: str | None = None
    fx_rate: Decimal | None = None
    counterparty_name: str | None = None
    counterparty_iban: str | None = None
    provider_category: str | None = None
    mcc: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


class BankConnector(Protocol):
    """Conti, saldi e movimenti di una connessione bancaria."""

    def list_accounts(self) -> list[ProviderAccount]: ...

    def get_balances(self, account_external_id: str) -> list[ProviderBalance]: ...

    def get_transactions(
        self, account_external_id: str, since: date
    ) -> list[ProviderTransaction]: ...


# --- Broker ------------------------------------------------------------------------------


@dataclass(frozen=True)
class ProviderCash:
    currency: str
    free: Decimal
    invested: Decimal
    total: Decimal
    unrealized_pl: Decimal | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderPosition:
    ticker: str
    quantity: Decimal
    avg_price: Decimal
    current_price: Decimal
    instrument_currency: str
    isin: str | None = None
    name: str | None = None
    fx_rate: Decimal | None = None  # 1 unità di valuta dello strumento = fx_rate EUR
    # Costo e valore in EUR come li calcola il broker (costo ai cambi storici): se ci sono,
    # valgono più di quantità × prezzo × cambio di oggi.
    cost_basis_eur: Decimal | None = None
    market_value_eur: Decimal | None = None
    quantity_in_pies: Decimal | None = None


@dataclass(frozen=True)
class ProviderOrder:
    external_id: str
    executed_at: datetime
    ticker: str
    side: Literal["buy", "sell"]
    quantity: Decimal
    fill_price: Decimal
    instrument_currency: str
    value_eur: Decimal
    isin: str | None = None
    fx_rate: Decimal | None = None
    fees_eur: Decimal | None = None
    taxes_eur: Decimal | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderDividend:
    external_id: str
    ticker: str
    paid_on: date
    amount: Decimal
    currency: str
    amount_eur: Decimal
    quantity: Decimal | None = None
    gross_per_share: Decimal | None = None
    withholding_tax: Decimal | None = None


@dataclass(frozen=True)
class ProviderCashFlow:
    external_id: str
    type: Literal["deposit", "withdrawal", "interest", "fee"]
    occurred_at: datetime
    amount: Decimal  # sempre positivo
    currency: str
    amount_eur: Decimal
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderPieInstrument:
    ticker: str
    expected_share: Decimal  # quota obiettivo, 0–1
    current_share: Decimal
    owned_quantity: Decimal
    invested_eur: Decimal
    value_eur: Decimal
    result_eur: Decimal


@dataclass(frozen=True)
class ProviderPie:
    """Una Pie (Trading 212): gruppo di strumenti con quote obiettivo, stato attuale."""

    external_id: str
    name: str
    cash_eur: Decimal  # liquidità nella Pie non ancora investita
    invested_eur: Decimal
    value_eur: Decimal
    result_eur: Decimal
    instruments: list[ProviderPieInstrument]
    goal_eur: Decimal | None = None
    icon: str | None = None
    dividend_action: str | None = None  # REINVEST | TO_ACCOUNT_CASH
    dividends_gained_eur: Decimal | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProviderBrokerAccount:
    external_id: str
    name: str
    currency: str
    institution: str


class BrokerConnector(Protocol):
    """Portafoglio di un conto broker."""

    def get_account(self) -> ProviderBrokerAccount: ...

    def get_cash(self) -> ProviderCash: ...

    def get_positions(self) -> list[ProviderPosition]: ...

    def get_orders(self, since: date) -> list[ProviderOrder]: ...

    def get_dividends(self, since: date) -> list[ProviderDividend]: ...

    def get_cash_flows(self, since: date) -> list[ProviderCashFlow]: ...

    def get_pies(self) -> list[ProviderPie]: ...
