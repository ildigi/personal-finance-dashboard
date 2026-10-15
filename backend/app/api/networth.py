"""Patrimonio netto (SPEC §16, Fase 9)."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.schemas.networth import NetWorthOverview
from app.services.dates import today_rome
from app.services.networth import net_worth_overview

router = APIRouter(prefix="/networth", tags=["patrimonio"])


@router.get("", response_model=NetWorthOverview)
def get_net_worth(
    session: DbSession,
    since: Annotated[
        date | None, Query(description="Primo giorno dello storico; vuoto = tutto quello che c'è")
    ] = None,
) -> NetWorthOverview:
    """Patrimonio di oggi per conto, storico giornaliero e variazioni a 30/90/365 giorni."""
    return net_worth_overview(session, today_rome(), since)
