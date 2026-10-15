"""Investimenti: portafoglio, rendimenti, Pie, ordini, dividendi, versamenti (sola lettura
verso il broker: le uniche scritture sono le preferenze della dashboard)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import DbSession
from app.ingestion.live import refresh_live
from app.schemas.investments import (
    InvestmentActivity,
    InvestmentSummary,
    LiveRefresh,
    PortfolioRead,
    PortfolioUpdate,
)
from app.services.dates import today_rome
from app.services.investments import (
    investment_activity,
    investment_summary,
    list_portfolios,
    set_tracking_start,
)

router = APIRouter(prefix="/investments", tags=["investments"])


def _check(session: DbSession, portfolio_id: int) -> None:
    if not any(p.id == portfolio_id for p in list_portfolios(session)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Portafoglio {portfolio_id} non trovato")


@router.get("/portfolios", response_model=list[PortfolioRead])
def get_portfolios(session: DbSession) -> list[PortfolioRead]:
    """Prima i conti veri, poi quelli di prova."""
    return list_portfolios(session)


@router.patch("/{portfolio_id}", response_model=PortfolioRead)
def update_portfolio(
    portfolio_id: int, payload: PortfolioUpdate, session: DbSession
) -> PortfolioRead:
    """Imposta (o toglie) la data di inizio dei rendimenti."""
    _check(session, portfolio_id)
    if payload.tracking_start is not None and payload.tracking_start > today_rome():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "La data di inizio non può essere nel futuro"
        )
    set_tracking_start(session, portfolio_id, payload.tracking_start)
    session.commit()
    return next(p for p in list_portfolios(session) if p.id == portfolio_id)


@router.get("/{portfolio_id}/summary", response_model=InvestmentSummary)
def get_summary(portfolio_id: int, session: DbSession) -> InvestmentSummary:
    """Valore, capitale versato, guadagno e rendimenti, posizioni, Pie."""
    _check(session, portfolio_id)
    return investment_summary(session, portfolio_id, today_rome())


@router.post("/{portfolio_id}/live", response_model=LiveRefresh)
def live_refresh(portfolio_id: int, session: DbSession) -> LiveRefresh:
    """Aggiornamento leggero di valore, liquidità e posizioni (2 richieste al broker).
    Il backend lo concede al massimo ogni 10 secondi; ordini e Pie restano alla sync."""
    _check(session, portfolio_id)
    result = refresh_live(session, portfolio_id)
    return LiveRefresh(refreshed=result.refreshed, as_of=result.as_of, message=result.message)


@router.get("/{portfolio_id}/activity", response_model=InvestmentActivity)
def get_activity(
    portfolio_id: int,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> InvestmentActivity:
    """Ordini eseguiti, dividendi, versamenti e la serie mensile, dalla data di inizio."""
    _check(session, portfolio_id)
    return investment_activity(session, portfolio_id, limit)
