"""Sezione Investimenti (SPEC §13)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import ApiModel, OrmModel


class PortfolioRead(OrmModel):
    id: int
    name: str
    institution: str
    is_mock: bool
    source_id: int
    last_sync_at: datetime | None
    tracking_start: date | None = Field(
        description="Data di inizio dei rendimenti: lo storico precedente si ignora"
    )


class PortfolioUpdate(ApiModel):
    tracking_start: date | None = Field(
        description="Data di inizio dei rendimenti; null = tutto lo storico"
    )


class PositionRead(OrmModel):
    ticker: str
    name: str | None
    isin: str | None
    quantity: Decimal
    avg_price: Decimal
    current_price: Decimal
    instrument_currency: str
    cost_eur: Decimal
    value_eur: Decimal
    pl_eur: Decimal
    pl_pct: float | None
    weight_pct: float = Field(description="Peso sul valore delle posizioni")
    pie_name: str | None


class PieInstrumentRead(OrmModel):
    ticker: str
    name: str | None
    expected_share_pct: float
    current_share_pct: float
    value_eur: Decimal
    result_eur: Decimal


class PieRead(OrmModel):
    id: int
    name: str
    cash_eur: Decimal = Field(description="Liquidità nella Pie non ancora investita")
    invested_eur: Decimal = Field(
        description="Base investita come nell'app: costo dei titoli + liquidità della Pie"
    )
    value_eur: Decimal = Field(description="Valore dei titoli + liquidità della Pie")
    result_eur: Decimal
    result_pct: float | None = Field(description="Risultato / investito, non annualizzato")
    goal_eur: Decimal | None
    dividend_action: str | None
    instruments: list[PieInstrumentRead]


class Returns(OrmModel):
    """Rendimenti dalla data di inizio. Nessuno di questi conta i versamenti come guadagno."""

    total_pl_eur: Decimal = Field(description="Valore attuale − capitale netto versato")
    simple_pct: float | None = Field(
        description="Rendimento principale: guadagno / capitale netto versato"
    )
    mwr_annual_pct: float | None = Field(
        description="Annuo ponderato per il denaro (XIRR), solo se affidabile: almeno un anno "
        "di storia e capitale investito in media per almeno metà del versato attuale"
    )
    average_invested_eur: Decimal = Field(
        description="Capitale netto versato medio nel tempo, dal primo versamento"
    )
    days: int = Field(description="Giorni dal primo versamento (o dalla data di inizio)")


class ActiveReturns(OrmModel):
    """Solo le posizioni in mano: come il risultato delle Pie nell'app. Come Trading 212,
    la liquidità nelle Pie non ancora investita conta sia nel costo sia nel valore."""

    value_eur: Decimal
    cost_eur: Decimal = Field(description="Costo dei titoli + liquidità nelle Pie (= totalCost)")
    pl_eur: Decimal = Field(description="Valore − costo delle posizioni aperte")
    pct: float | None = Field(description="Guadagno / costo, non annualizzato")


class PlBreakdown(OrmModel):
    unrealized_eur: Decimal
    realized_eur: Decimal
    dividends_eur: Decimal
    interest_eur: Decimal
    fees_eur: Decimal = Field(description="Commissioni (positive = pagate)")
    other_eur: Decimal = Field(description="Il resto: cambi, arrotondamenti, eventi societari")


class InvestmentSummary(OrmModel):
    portfolio: PortfolioRead
    as_of: datetime | None = Field(description="Ultimo aggiornamento del portafoglio")
    value_eur: Decimal = Field(description="Valore del conto: posizioni + liquidità")
    positions_value_eur: Decimal
    positions_cost_eur: Decimal = Field(description="Costo delle posizioni aperte")
    cash_eur: Decimal = Field(description="Liquidità non investita (anche quella nelle Pie)")
    opening_balance_eur: Decimal = Field(
        description="Saldo alla data di inizio (liquidità + costo delle posizioni): capitale "
        "di partenza. Zero senza data di inizio"
    )
    deposits_eur: Decimal = Field(description="Versamenti dalla data di inizio")
    withdrawals_eur: Decimal = Field(description="Prelievi dalla data di inizio")
    net_deposited_eur: Decimal = Field(
        description="Capitale netto versato: saldo di partenza + versamenti − prelievi"
    )
    returns: Returns
    active: ActiveReturns
    breakdown: PlBreakdown
    dividends_12m_eur: Decimal
    dividend_yield_on_cost_pct: float | None
    positions: list[PositionRead]
    pies: list[PieRead]


class OrderRead(OrmModel):
    id: int
    executed_at: datetime
    ticker: str
    name: str | None
    side: str
    quantity: Decimal
    fill_price: Decimal
    instrument_currency: str
    value_eur: Decimal
    fees_eur: Decimal | None


class DividendRead(OrmModel):
    id: int
    paid_on: date
    ticker: str
    name: str | None
    quantity: Decimal | None
    amount_eur: Decimal


class CashFlowRead(OrmModel):
    id: int
    occurred_at: datetime
    type: str
    amount_eur: Decimal
    transaction_id: int | None = Field(description="Bonifico abbinato in banca, se trovato")


class InvestmentMonth(OrmModel):
    month: str
    deposits_eur: Decimal
    withdrawals_eur: Decimal
    dividends_eur: Decimal
    interest_eur: Decimal
    bought_eur: Decimal
    sold_eur: Decimal
    net_deposited_eur: Decimal = Field(description="Capitale netto versato a fine mese")
    value_eur: Decimal | None = Field(description="Valore a fine mese, se c'è un'istantanea")


class LiveRefresh(OrmModel):
    """Aggiornamento leggero di valore, liquidità e posizioni."""

    refreshed: bool = Field(description="Falso se troppo ravvicinato, in corso o non possibile")
    as_of: datetime | None = Field(description="Istante dell'ultima istantanea")
    message: str | None = Field(description="Perché non è stato aggiornato, se c'è un errore")


class InvestmentActivity(OrmModel):
    orders: list[OrderRead]
    dividends: list[DividendRead]
    cash_flows: list[CashFlowRead]
    months: list[InvestmentMonth]
