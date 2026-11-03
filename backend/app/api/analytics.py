"""Analisi di spese ed entrate per le pagine Spese, Entrate e Panoramica."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession
from app.core.messages import http_error
from app.schemas.analytics import ExpensesSummary, IncomeSummary, MerchantTotal, MonthlySeries
from app.services.analytics import (
    expenses_summary,
    income_summary,
    merchants_ranking,
    monthly_series,
)
from app.services.dates import today_rome

router = APIRouter(prefix="/analytics", tags=["analytics"])

MAX_RANGE_DAYS = 3 * 366


def _check_range(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        raise http_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "range.invalid")
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        raise http_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "range.too_long")


@router.get("/expenses", response_model=ExpensesSummary)
def get_expenses(session: DbSession, date_from: date, date_to: date) -> ExpensesSummary:
    """Spese reali del periodo per categoria, confronto con il periodo precedente, medie."""
    _check_range(date_from, date_to)
    return expenses_summary(session, date_from, date_to, today_rome())


@router.get("/income", response_model=IncomeSummary)
def get_income(session: DbSession, date_from: date, date_to: date) -> IncomeSummary:
    """Entrate per tipologia, tasso di risparmio, medie."""
    _check_range(date_from, date_to)
    return income_summary(session, date_from, date_to, today_rome())


@router.get("/monthly", response_model=MonthlySeries)
def get_monthly(
    session: DbSession,
    months: Annotated[int, Query(ge=1, le=36)] = 12,
    end: Annotated[
        date | None, Query(description="Un giorno dell'ultimo mese; default oggi")
    ] = None,
) -> MonthlySeries:
    """Serie mensile: spese per categoria, entrate, investito, saldo."""
    return monthly_series(session, end or today_rome(), months)


@router.get("/merchants", response_model=list[MerchantTotal])
def get_merchants(
    session: DbSession,
    date_from: date,
    date_to: date,
    limit: Annotated[int, Query(ge=1, le=100)] = 15,
) -> list[MerchantTotal]:
    """Classifica dei merchant per spesa nel periodo."""
    _check_range(date_from, date_to)
    return merchants_ranking(session, date_from, date_to, limit)
