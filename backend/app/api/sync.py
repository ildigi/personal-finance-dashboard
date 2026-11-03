from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request, status
from sqlalchemy import select

from app.api.banks import request_psu_headers
from app.api.deps import DbSession, get_or_404
from app.core.config import get_settings
from app.core.messages import http_error
from app.ingestion.mock_setup import ensure_mock_sources
from app.ingestion.runner import SyncSummary, run_sync
from app.ingestion.trading212_setup import (
    credentials_available,
    ensure_trading212_source,
    find_trading212_source,
)
from app.integrations.registry import (
    ConnectorUnavailableError,
    ConsentRequiredError,
    connector_for,
)
from app.integrations.trading212.client import Trading212Error
from app.models import AccountSource, SyncLog
from app.models.enums import Provider, SourceStatus
from app.schemas.sync import SyncLogRead, SyncSummaryRead, Trading212Status
from app.services.dates import today_rome

router = APIRouter(tags=["sync"])


@router.post("/sources/{source_id}/sync", response_model=SyncSummaryRead)
def sync_source(source_id: int, request: Request, session: DbSession) -> SyncSummary:
    """Sincronizza subito una sorgente (sola lettura presso il provider). Chiesta da te:
    per le banche vale come lettura con l'utente presente."""
    source = get_or_404(session, AccountSource, source_id)
    if source.status == SourceStatus.DISABLED:
        raise http_error(status.HTTP_409_CONFLICT, "source.disabled")
    try:
        connector = connector_for(source, today_rome())
    except ConsentRequiredError as exc:
        source.status = SourceStatus.EXPIRED
        session.commit()
        raise http_error(status.HTTP_409_CONFLICT, exc) from exc
    except ConnectorUnavailableError as exc:
        raise http_error(status.HTTP_409_CONFLICT, exc) from exc
    close = getattr(connector, "close", None)
    if close is not None:
        close()
    return run_sync(session, source, psu_headers=request_psu_headers(request))


@router.get("/sources/trading212/status", response_model=Trading212Status)
def trading212_status(session: DbSession) -> Trading212Status:
    """C'è il file con chiave e secret? La sorgente è già collegata? (Nessuna chiamata esterna.)"""
    source = find_trading212_source(session)
    return Trading212Status(
        credentials_found=credentials_available(),
        source_id=source.id if source else None,
    )


@router.post("/sources/trading212", response_model=SyncSummaryRead)
def connect_trading212(session: DbSession) -> SyncSummary:
    """Collega il conto Trading 212 (chiave nel file dei segreti) e lo sincronizza."""
    try:
        source = ensure_trading212_source(session)
    except Trading212Error as exc:
        raise http_error(status.HTTP_409_CONFLICT, exc) from exc
    session.commit()
    return run_sync(session, source)


@router.get("/sync-logs", response_model=list[SyncLogRead])
def list_sync_logs(
    session: DbSession,
    source_id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[SyncLog]:
    query = select(SyncLog).order_by(SyncLog.started_at.desc(), SyncLog.id.desc()).limit(limit)
    if source_id is not None:
        query = query.where(SyncLog.source_id == source_id)
    return list(session.scalars(query))


@router.post("/mock/setup", response_model=list[SyncSummaryRead])
def setup_mock_data(session: DbSession) -> list[SyncSummary]:
    """Crea le sorgenti di prova (se mancano) e le sincronizza.
    In produzione solo con la modalità demo attiva."""
    settings = get_settings()
    if settings.app_env == "production" and not settings.demo_mode:
        raise http_error(status.HTTP_403_FORBIDDEN, "source.mock_in_production")
    sources = ensure_mock_sources(session)
    session.commit()
    return [run_sync(session, source) for source in sources if source.provider == Provider.MOCK]
