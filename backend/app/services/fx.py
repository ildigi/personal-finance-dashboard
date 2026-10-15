"""Conversione in EUR con la tabella `fx_rates` (1 unità di valuta = rate_to_eur EUR)."""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FxRate

CENT = Decimal("0.01")


class FxRateMissingError(LookupError):
    pass


def rate_to_eur(session: Session, currency: str, day: date) -> Decimal:
    if currency == "EUR":
        return Decimal(1)
    rate = session.scalar(
        select(FxRate.rate_to_eur)
        .where(FxRate.currency == currency, FxRate.date <= day)
        .order_by(FxRate.date.desc())
        .limit(1)
    )
    if rate is None:
        raise FxRateMissingError(f"Nessun cambio {currency}/EUR disponibile al {day.isoformat()}")
    return rate


def to_eur(session: Session, amount: Decimal, currency: str, day: date) -> Decimal:
    if currency == "EUR":
        return amount
    return (amount * rate_to_eur(session, currency, day)).quantize(CENT, rounding=ROUND_HALF_UP)
