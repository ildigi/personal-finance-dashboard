"""Date di riferimento: le date contabili si ragionano nel fuso di Roma."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")


def today_rome(now: datetime | None = None) -> date:
    return (now or datetime.now(ROME)).astimezone(ROME).date()
