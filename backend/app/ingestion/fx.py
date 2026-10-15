"""Cambi in EUR per i movimenti in altre valute (es. PayPal in USD).

Prima di salvare i movimenti di un conto si controlla di avere i cambi BCE per le
valute che compaiono, dal giorno più vecchio (meno una settimana: weekend e festivi
usano l'ultimo cambio disponibile). Se mancano si scaricano e si salvano in `fx_rates`.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.integrations.ecb import EcbError, EcbRates, fetch_rates
from app.models import FxRate

log = logging.getLogger(__name__)

SOURCE = "BCE"
MARGIN_DAYS = 7
RATE_DIGITS = Decimal("0.0000000001")

#: Sostituibile nei test: nessuna richiesta di rete.
Fetcher = Callable[[date, date], EcbRates]


def _covered(session: Session, currency: str, since: date, latest: date) -> bool:
    first, last = session.execute(
        select(func.min(FxRate.date), func.max(FxRate.date)).where(FxRate.currency == currency)
    ).one()
    return first is not None and first <= since and last >= latest


def ensure_rates(
    session: Session,
    needed: Iterable[tuple[str, date]],
    today: date,
    *,
    fetcher: Fetcher | None = None,
) -> int:
    """Cambi per le coppie (valuta, giorno) richieste; restituisce quanti ne ha salvati.
    Se la BCE non risponde non fa nulla: la conversione poi segnalerà il cambio mancante."""
    oldest: dict[str, date] = {}
    newest: dict[str, date] = {}
    for currency, day in needed:
        if currency == "EUR":
            continue
        oldest[currency] = min(day, oldest.get(currency, day))
        newest[currency] = max(day, newest.get(currency, day))
    missing = {
        c: oldest[c] - timedelta(days=MARGIN_DAYS)
        for c in oldest
        # Per l'ultimo giorno basta il cambio del giorno lavorativo prima (la BCE pubblica
        # nel pomeriggio, e non nei weekend).
        # Coperto = c'è un cambio entro il giorno più vecchio (vale anche quello di prima).
        if not _covered(session, c, oldest[c], newest[c] - timedelta(days=4))
    }
    if not missing:
        return 0
    try:
        rates = (fetcher or fetch_rates)(min(missing.values()), today)
    except EcbError as exc:
        log.warning("%s", exc)
        return 0
    existing = {
        (d, c)
        for d, c in session.execute(
            select(FxRate.date, FxRate.currency).where(FxRate.currency.in_(list(missing)))
        )
    }
    saved = 0
    for day, values in rates.items():
        for currency in missing:
            per_eur = values.get(currency)
            if per_eur is None or (day, currency) in existing:
                continue
            session.add(
                FxRate(
                    date=day,
                    currency=currency,
                    rate_to_eur=(Decimal(1) / per_eur).quantize(RATE_DIGITS),
                    source=SOURCE,
                )
            )
            saved += 1
    session.flush()
    return saved
