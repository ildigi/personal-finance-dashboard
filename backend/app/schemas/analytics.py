"""Analisi di spese ed entrate (pagine Spese, Entrate, Panoramica)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class Period(BaseModel):
    date_from: date
    date_to: date


class Averages(BaseModel):
    """Media mensile sui mesi interi più recenti (esclusi quelli prima dei primi dati)."""

    m3: Decimal | None
    m6: Decimal | None
    m12: Decimal | None


class SubcategoryTotal(BaseModel):
    subcategory_id: int | None
    name: str
    total_eur: Decimal
    count: int


class CategoryTotal(BaseModel):
    category_id: int | None = Field(description="Nullo = movimenti da classificare")
    name: str
    icon: str | None
    color: str | None
    total_eur: Decimal
    previous_eur: Decimal
    count: int
    share_pct: float
    subcategories: list[SubcategoryTotal]


class ExpensesSummary(BaseModel):
    period: Period
    previous_period: Period = Field(
        description="Stesso intervallo, spostato indietro, fino allo stesso giorno"
    )
    total_eur: Decimal = Field(
        description="Spese reali (spese + commissioni − rimborsi), in positivo"
    )
    previous_total_eur: Decimal
    delta_eur: Decimal
    delta_pct: float | None
    count: int
    invested_eur: Decimal = Field(description="Spostati e investiti: versamenti netti al broker")
    previous_invested_eur: Decimal
    averages: Averages
    subscriptions_monthly_eur: Decimal | None = Field(
        description="Abbonamenti confermati tra le ricorrenze (equivalente mensile); se non ce "
        "ne sono, media mensile della categoria Abbonamenti negli ultimi 3 mesi interi"
    )
    subscriptions_source: Literal["recurring", "average"]
    unclassified_count: int
    categories: list[CategoryTotal]


class MonthCategory(BaseModel):
    category_id: int | None = Field(description="Nullo = movimenti da classificare")
    total_eur: Decimal


class MonthPoint(BaseModel):
    month: str = Field(description="AAAA-MM")
    expenses_eur: Decimal
    income_eur: Decimal
    invested_eur: Decimal
    net_eur: Decimal = Field(description="Entrate − spese reali")
    categories: list[MonthCategory]


class MonthlySeries(BaseModel):
    months: list[MonthPoint]


class MerchantTotal(BaseModel):
    merchant_id: int
    name: str
    total_eur: Decimal
    count: int
    average_eur: Decimal
    last_date: date
    category_id: int | None


class IncomeTypeTotal(BaseModel):
    income_type_id: int | None
    code: str
    label: str
    total_eur: Decimal
    count: int


class IncomeSummary(BaseModel):
    period: Period
    previous_period: Period
    total_eur: Decimal
    previous_total_eur: Decimal
    delta_pct: float | None
    count: int
    expenses_eur: Decimal
    savings_eur: Decimal
    savings_rate_pct: float | None = Field(description="(entrate − spese reali) / entrate")
    averages: Averages
    dividends_eur: Decimal = Field(description="Dividendi del broker nel periodo (voce separata)")
    by_type: list[IncomeTypeTotal]
