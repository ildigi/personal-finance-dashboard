"""Esegue la sincronizzazione di una sorgente e la registra in `sync_logs`.

Ogni passo (conti, saldi, movimenti, portafoglio, ...) ha il suo log. Se un passo
fallisce, le modifiche della sincronizzazione vengono annullate ma il log dell'errore
resta, con un messaggio senza dati sensibili.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from functools import partial

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.classification.engine import classify_all
from app.core.logging import mask_iban
from app.core.messages import AppError, Params, coded
from app.ingestion import bank as bank_ingest
from app.ingestion import broker as broker_ingest
from app.ingestion.bank import JobStats
from app.ingestion.locks import source_lock
from app.integrations.base import BankConnector, BrokerConnector
from app.integrations.enablebanking.client import ConsentExpiredError
from app.integrations.registry import ConsentRequiredError, connector_for, is_broker
from app.models import Account, AccountSource, InvestmentOrder, SyncLog
from app.models.enums import SourceStatus, SyncJob, SyncStatus
from app.services.dates import today_rome
from app.services.networth import record_snapshot

log = logging.getLogger(__name__)


@dataclass
class JobResult:
    job: str
    status: str
    fetched: int = 0
    created: int = 0
    updated: int = 0
    details: dict[str, int] = field(default_factory=dict)
    error: str | None = None
    error_code: str | None = None
    error_params: Params = field(default_factory=dict)


@dataclass
class SyncSummary:
    source_id: int
    status: str
    started_at: datetime
    finished_at: datetime
    jobs: list[JobResult]


def _safe_message(exc: Exception) -> str:
    return mask_iban(f"{type(exc).__name__}: {exc}")[:300]


class _Recorder:
    """Accumula l'esito di ogni passo; un passo può girare più volte (es. per conto)."""

    def __init__(self) -> None:
        self.results: dict[str, JobResult] = {}
        self.started: dict[str, datetime] = {}
        self.current: SyncJob = SyncJob.ACCOUNTS

    def run(self, job: SyncJob, fn: Callable[[], JobStats]) -> None:
        self.current = job
        self.started.setdefault(job, datetime.now(UTC))
        stats = fn()
        result = self.results.setdefault(job, JobResult(job=job, status=SyncStatus.SUCCESS))
        result.fetched += stats.fetched
        result.created += stats.created
        result.updated += stats.updated
        for key, value in stats.details.items():
            result.details[key] = result.details.get(key, 0) + value

    def logs(self, source_id: int, finished: datetime) -> list[SyncLog]:
        return [
            SyncLog(
                source_id=source_id,
                job=job,
                started_at=self.started.get(job, finished),
                finished_at=finished,
                status=result.status,
                items_fetched=result.fetched,
                items_created=result.created,
                items_updated=result.updated,
                error_message=result.error,
                error_code=result.error_code,
                error_params=result.error_params or None,
            )
            for job, result in self.results.items()
        ]


def _sync_bank(
    session: Session, source: AccountSource, rec: _Recorder, connector: BankConnector, today: date
) -> None:
    accounts: dict[str, Account] = {}
    stats = JobStats()

    def do_accounts() -> JobStats:
        nonlocal accounts, stats
        accounts, stats = bank_ingest.upsert_accounts(session, source, connector.list_accounts())
        return stats

    rec.run(SyncJob.ACCOUNTS, do_accounts)
    for account in accounts.values():
        rec.run(SyncJob.BALANCES, partial(bank_ingest.sync_balances, session, account, connector))
        rec.run(
            SyncJob.TRANSACTIONS,
            partial(bank_ingest.sync_transactions, session, account, connector, today=today),
        )


def _sync_broker(
    session: Session,
    source: AccountSource,
    rec: _Recorder,
    connector: BrokerConnector,
    today: date,
    now: datetime,
) -> None:
    portfolio, stats = broker_ingest.ensure_portfolio(session, source, connector)
    rec.run(SyncJob.ACCOUNTS, lambda: stats)
    last = session.scalar(
        select(func.max(InvestmentOrder.executed_at)).where(
            InvestmentOrder.portfolio_id == portfolio.id
        )
    )
    since = (last.date() - timedelta(days=10)) if last else today - timedelta(days=3650)
    rec.run(
        SyncJob.PORTFOLIO,
        partial(
            broker_ingest.snapshot_portfolio,
            session,
            portfolio,
            connector,
            snapshot_at=now,
            today=today,
        ),
    )
    rec.run(
        SyncJob.ORDERS, partial(broker_ingest.sync_orders, session, portfolio, connector, since)
    )
    rec.run(
        SyncJob.DIVIDENDS,
        partial(broker_ingest.sync_dividends, session, portfolio, connector, since),
    )
    rec.run(
        SyncJob.CASH_FLOWS,
        partial(broker_ingest.sync_cash_flows, session, portfolio, connector, since),
    )
    rec.run(
        SyncJob.PIES,
        partial(broker_ingest.sync_pies, session, portfolio, connector, synced_at=now),
    )


def classify_job(session: Session, today: date | None = None) -> JobStats:
    """Riclassifica tutti i movimenti: le coppie tra conti diversi si formano solo quando
    entrambi i lati sono stati sincronizzati. Poi aggiorna le ricorrenze."""
    result = classify_all(session, today=today)
    stats = JobStats(fetched=result.total, updated=result.changed)
    for key, value in (
        ("transfer_pairs", result.transfer_pairs),
        ("investment_links", result.investment_links),
        ("refunds", result.refunds_linked),
        ("new_merchants", result.merchants_created),
        ("unclassified", result.by_source.get("none", 0)),
        ("new_recurring", result.recurring.created if result.recurring else 0),
    ):
        if value:
            stats.bump(key, value)
    return stats


def _snapshot_net_worth(session: Session, today: date) -> None:
    """Foto del patrimonio di oggi: se non riesce, la sincronizzazione resta valida."""
    try:
        with session.begin_nested():
            record_snapshot(session, today)
    except Exception:
        log.exception("Foto del patrimonio non salvata")


def run_sync(
    session: Session,
    source: AccountSource,
    *,
    today: date | None = None,
    psu_headers: dict[str, str] | None = None,
) -> SyncSummary:
    """Sincronizza una sorgente. Fa commit, anche quando registra un errore.
    Una sola sincronizzazione (o aggiornamento leggero) alla volta per sorgente.
    `psu_headers`: sync chiesta dall'utente presente (le banche non la contano nel limite)."""
    with source_lock(source.id):
        return _run_sync(session, source, today or today_rome(), psu_headers)


def _run_sync(
    session: Session, source: AccountSource, today: date, psu_headers: dict[str, str] | None
) -> SyncSummary:
    source_id = source.id
    started = datetime.now(UTC).replace(microsecond=0)
    rec = _Recorder()

    try:
        connector = connector_for(source, today, psu_headers=psu_headers)
        try:
            if is_broker(source):
                _sync_broker(session, source, rec, connector, today, started)  # type: ignore[arg-type]
            else:
                _sync_bank(session, source, rec, connector, today)  # type: ignore[arg-type]
        finally:
            close = getattr(connector, "close", None)
            if close is not None:
                close()
        rec.run(SyncJob.CLASSIFICATION, partial(classify_job, session, today))
        _snapshot_net_worth(session, today)
        finished = datetime.now(UTC)
        source.last_sync_at = finished
        source.status = SourceStatus.ACTIVE
        session.add_all(rec.logs(source_id, finished))
        session.commit()
        status = SyncStatus.SUCCESS
    except Exception as exc:
        session.rollback()
        message = _safe_message(exc)
        log.warning("Sincronizzazione della sorgente %s fallita: %s", source_id, message)
        finished = datetime.now(UTC)
        code, params = (exc.code, exc.params) if isinstance(exc, AppError) else coded("unexpected")
        failed = JobResult(
            job=rec.current,
            status=SyncStatus.ERROR,
            error=message,
            error_code=code,
            error_params=params,
        )
        rec.results = {rec.current: failed}
        reloaded = session.get(AccountSource, source_id)
        if reloaded is not None:
            expired = isinstance(exc, (ConsentRequiredError, ConsentExpiredError))
            reloaded.status = SourceStatus.EXPIRED if expired else SourceStatus.ERROR
        session.add_all(rec.logs(source_id, finished))
        session.commit()
        status = SyncStatus.ERROR

    return SyncSummary(
        source_id=source_id,
        status=status,
        started_at=started,
        finished_at=finished,
        jobs=list(rec.results.values()),
    )
