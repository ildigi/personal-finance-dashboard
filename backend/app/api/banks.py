"""Banche via Enable Banking: elenco, consenso (AIS, sola lettura dei conti), ritorno."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request, status

from app.api.deps import DbSession, get_or_404
from app.core.config import get_settings
from app.core.messages import http_error
from app.ingestion import enablebanking_setup as setup
from app.ingestion.runner import SyncSummary, run_sync
from app.integrations.enablebanking.client import EnableBankingError
from app.models import AccountSource
from app.models.enums import Provider
from app.schemas.banks import (
    AuthorizeRequest,
    AuthorizeResponse,
    BankRead,
    BanksStatus,
    CallbackRequest,
    CallbackResponse,
    DisconnectResponse,
)
from app.schemas.sync import SyncSummaryRead

router = APIRouter(prefix="/banks", tags=["banks"])


def request_psu_headers(request: Request) -> dict[str, str]:
    """L'utente è davanti alla dashboard: lo si dice alla banca."""
    return setup.psu_headers(
        request.client.host if request.client else None,
        request.headers.get("user-agent"),
        request.headers.get("accept-language"),
    )


@router.get("/status", response_model=BanksStatus)
def banks_status() -> BanksStatus:
    """Credenziali presenti? (Nessuna chiamata esterna.)"""
    try:
        environment: str | None = setup.credentials().environment
    except EnableBankingError:
        environment = None
    return BanksStatus(
        credentials_found=environment is not None,
        environment=environment,
        redirect_url=get_settings().eb_redirect_url,
    )


@router.get("/aspsps", response_model=list[BankRead])
def list_banks(country: Annotated[str, Query(pattern=r"^[A-Z]{2}$")] = "IT") -> list[BankRead]:
    """Banche disponibili per il paese (in Sandbox solo banche di prova)."""
    try:
        banks = setup.list_banks(country)
    except EnableBankingError as exc:
        raise http_error(status.HTTP_409_CONFLICT, exc) from exc
    return [BankRead.model_validate(b, from_attributes=True) for b in banks]


@router.post("/authorize", response_model=AuthorizeResponse)
def authorize(payload: AuthorizeRequest, session: DbSession) -> AuthorizeResponse:
    """Prepara il consenso e restituisce l'indirizzo della banca (login e SCA lì)."""
    aspsp_name, country, psu_type = payload.aspsp_name, payload.country, payload.psu_type
    if payload.source_id is not None:
        source = get_or_404(session, AccountSource, payload.source_id)
        if source.provider != Provider.ENABLEBANKING:
            raise http_error(status.HTTP_409_CONFLICT, "bank.not_connected")
        try:
            previous = setup.session_data(source)
        except setup.AuthorizationError:
            previous = {}
        aspsp = previous.get("aspsp") or {}
        aspsp_name = aspsp_name or aspsp.get("name") or source.institution
        country = aspsp.get("country") or country
        psu_type = previous.get("psu_type") or psu_type
    try:
        url = setup.start_authorization(
            aspsp_name=str(aspsp_name),
            country=country,
            psu_type=psu_type,
            source_id=payload.source_id,
        )
    except (EnableBankingError, setup.AuthorizationError) as exc:
        raise http_error(status.HTTP_409_CONFLICT, exc) from exc
    return AuthorizeResponse(url=url)


@router.delete("/sources/{source_id}", response_model=DisconnectResponse)
def disconnect(source_id: int, session: DbSession, delete_data: bool = False) -> DisconnectResponse:
    """Scollega una banca: revoca il consenso; con `delete_data` elimina conti e movimenti,
    altrimenti li tiene e disattiva la sorgente."""
    source = get_or_404(session, AccountSource, source_id)
    if source.provider != Provider.ENABLEBANKING:
        raise http_error(status.HTTP_409_CONFLICT, "bank.not_connected")
    deleted = setup.disconnect(session, source, delete_data=delete_data)
    session.commit()
    return DisconnectResponse(deleted_transactions=deleted)


@router.post("/callback", response_model=CallbackResponse)
def callback(payload: CallbackRequest, request: Request, session: DbSession) -> CallbackResponse:
    """Ritorno dalla banca: salva la sessione (cifrata) e sincronizza subito."""
    if payload.error or not payload.code:
        detail = payload.error_description or payload.error
        if not detail:
            raise http_error(status.HTTP_400_BAD_REQUEST, "bank.authorization_incomplete")
        raise http_error(status.HTTP_400_BAD_REQUEST, "bank.provider_error", message=detail)
    try:
        source = setup.complete_authorization(session, code=payload.code, state=payload.state)
    except (EnableBankingError, setup.AuthorizationError) as exc:
        session.rollback()
        raise http_error(status.HTTP_409_CONFLICT, exc) from exc
    session.commit()
    accounts = len(setup.session_data(source).get("accounts") or [])
    summary: SyncSummary = run_sync(session, source, psu_headers=request_psu_headers(request))
    return CallbackResponse(
        source_id=source.id,
        institution=source.institution,
        accounts=accounts,
        sync=SyncSummaryRead.model_validate(summary, from_attributes=True),
    )
