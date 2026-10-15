"""Aggiornamento leggero del portafoglio: valore, liquidità e posizioni (SPEC §13).

Con la pagina Investimenti aperta il frontend lo chiede ogni 15 secondi. Costa due
chiamate al broker (riepilogo del conto e posizioni) e scrive un'istantanea, che nello
stesso quarto d'ora sostituisce la precedente. Il backend lo concede al massimo una volta
ogni `MIN_INTERVAL_SECONDS` per portafoglio (più schede aperte non moltiplicano le
chiamate) e mai durante una sincronizzazione completa della stessa sorgente.

Ordini, dividendi, movimenti e Pie restano alla sincronizzazione completa.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion import broker as broker_ingest
from app.ingestion.locks import source_lock
from app.integrations.registry import ConnectorUnavailableError, connector_for
from app.integrations.trading212.client import Trading212Error
from app.models import Account, AccountSource, Portfolio, PortfolioCashSnapshot
from app.models.enums import Provider, SourceStatus
from app.services.dates import today_rome

log = logging.getLogger(__name__)

MIN_INTERVAL_SECONDS = 10.0

_last_refresh: dict[int, float] = {}
_guard = threading.Lock()


@dataclass(frozen=True)
class LiveResult:
    refreshed: bool
    as_of: datetime | None
    message: str | None = None


def _latest_at(session: Session, portfolio_id: int) -> datetime | None:
    return session.scalar(
        select(PortfolioCashSnapshot.snapshot_at)
        .where(PortfolioCashSnapshot.portfolio_id == portfolio_id)
        .order_by(PortfolioCashSnapshot.snapshot_at.desc())
        .limit(1)
    )


def _claim(portfolio_id: int, clock: Callable[[], float]) -> bool:
    """Vero se è passato abbastanza tempo dall'ultimo aggiornamento (e lo prenota)."""
    with _guard:
        now = clock()
        last = _last_refresh.get(portfolio_id)
        if last is not None and now - last < MIN_INTERVAL_SECONDS:
            return False
        _last_refresh[portfolio_id] = now
        return True


def refresh_live(
    session: Session, portfolio_id: int, *, clock: Callable[[], float] = time.monotonic
) -> LiveResult:
    """Nuova istantanea di valore e posizioni, se possibile. Non solleva errori del broker:
    li restituisce nel messaggio (la pagina mostra i dati dell'ultima istantanea)."""
    row = session.execute(
        select(Portfolio, AccountSource)
        .join(Account, Account.id == Portfolio.account_id)
        .join(AccountSource, AccountSource.id == Account.source_id)
        .where(Portfolio.id == portfolio_id)
    ).one()
    portfolio, source = row
    as_of = _latest_at(session, portfolio_id)
    if source.provider != Provider.TRADING212:
        return LiveResult(False, as_of, "Aggiornamento in tempo reale solo per Trading 212")
    if source.status == SourceStatus.DISABLED:
        return LiveResult(False, as_of, "La sorgente è disattivata")
    if not _claim(portfolio_id, clock):
        return LiveResult(False, as_of)

    lock = source_lock(source.id)
    if not lock.acquire(blocking=False):
        return LiveResult(False, as_of, "Sincronizzazione in corso")
    try:
        today = today_rome()
        connector = connector_for(source, today)
        try:
            broker_ingest.snapshot_portfolio(
                session,
                portfolio,
                connector,  # type: ignore[arg-type]
                snapshot_at=datetime.now(UTC),
                today=today,
            )
        finally:
            close = getattr(connector, "close", None)
            if close is not None:
                close()
        session.commit()
    except (Trading212Error, ConnectorUnavailableError) as exc:
        session.rollback()
        log.warning("Aggiornamento del portafoglio %s non riuscito: %s", portfolio_id, exc)
        return LiveResult(False, as_of, str(exc))
    finally:
        lock.release()
    return LiveResult(True, _latest_at(session, portfolio_id))


def reset_throttle() -> None:
    """Per i test."""
    with _guard:
        _last_refresh.clear()
