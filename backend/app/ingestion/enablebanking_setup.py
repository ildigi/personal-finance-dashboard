"""Collegamento delle banche via Enable Banking (Fase 8): consenso e sorgenti.

Flusso:
1. `start_authorization`: chiede a Enable Banking l'URL della banca. Lo `state` che
   accompagna il viaggio è cifrato (banca scelta, eventuale sorgente da rinnovare) e
   scade dopo `STATE_TTL_SECONDS`: chi non l'ha generato non può completare il consenso.
2. L'utente fa login e SCA nell'app della banca e torna su `EB_REDIRECT_URL` con `code`.
3. `complete_authorization`: il codice diventa una sessione; la sorgente nel database
   salva solo la sessione **cifrata** (id e conti autorizzati) e la scadenza del consenso.
   Rinnovando il consenso si aggiorna la stessa sorgente e la sessione vecchia si revoca.

Le password della banca non passano mai dalla dashboard.
"""

from __future__ import annotations

import ipaddress
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.crypto import DecryptionError, decrypt_json, encrypt_json
from app.integrations.enablebanking.client import (
    Credentials,
    EnableBankingClient,
    EnableBankingError,
    load_credentials,
)
from app.integrations.enablebanking.connector import session_account
from app.models import AccountSource
from app.models.enums import Provider, SourceStatus

log = logging.getLogger(__name__)

SECRETS_FILE = "enablebanking.env"
CREDENTIALS_REF = f"secrets:{SECRETS_FILE}"
STATE_TTL_SECONDS = 30 * 60
MAX_CONSENT = timedelta(days=180)


class AuthorizationError(RuntimeError):
    """Consenso non completato: messaggio leggibile."""


def credentials_path() -> Path:
    return get_settings().secrets_dir / SECRETS_FILE


def credentials() -> Credentials:
    return load_credentials(credentials_path())


def credentials_available() -> bool:
    try:
        credentials()
    except EnableBankingError:
        return False
    return True


def make_client(psu_headers: dict[str, str] | None = None) -> EnableBankingClient:
    return EnableBankingClient(credentials(), psu_headers=psu_headers)


def psu_headers(ip: str | None, user_agent: str | None, language: str | None) -> dict[str, str]:
    """Intestazioni "utente presente" per le letture fatte a mano dalla dashboard: molte
    banche non le contano nel limite di 4 letture al giorno. L'IP si passa solo se pubblico
    (in locale il backend vede 127.0.0.1, che non direbbe niente alla banca)."""
    headers = {}
    if user_agent:
        headers["Psu-User-Agent"] = user_agent[:300]
    if language:
        headers["Psu-Accept-language"] = language[:100]
    if ip:
        try:
            if ipaddress.ip_address(ip).is_global:
                headers["Psu-Ip-Address"] = ip
        except ValueError:
            pass
    return headers


# --- Banche --------------------------------------------------------------------------------


@dataclass(frozen=True)
class Bank:
    name: str
    country: str
    logo: str | None
    psu_types: list[str]
    max_consent_days: int | None
    beta: bool


def list_banks(country: str) -> list[Bank]:
    with make_client() as client:
        raw = client.aspsps(country)
    banks = [
        Bank(
            name=str(a.get("name")),
            country=str(a.get("country") or country),
            logo=a.get("logo"),
            psu_types=list(a.get("psu_types") or []),
            max_consent_days=(
                int(a["maximum_consent_validity"]) // 86400
                if a.get("maximum_consent_validity")
                else None
            ),
            beta=bool(a.get("beta")),
        )
        for a in raw
        if a.get("name")
    ]
    return sorted(banks, key=lambda b: b.name.lower())


# --- Consenso --------------------------------------------------------------------------------


def start_authorization(
    *,
    aspsp_name: str,
    country: str,
    psu_type: str = "personal",
    source_id: int | None = None,
    now: datetime | None = None,
) -> str:
    """URL della banca dove autorizzare la lettura dei conti."""
    now = now or datetime.now(UTC)
    with make_client() as client:
        bank = next((a for a in client.aspsps(country) if a.get("name") == aspsp_name), None)
        if bank is None:
            raise AuthorizationError(f"Banca non disponibile: {aspsp_name}")
        maximum = timedelta(seconds=int(bank.get("maximum_consent_validity") or 0))
        validity = min(maximum, MAX_CONSENT) if maximum else timedelta(days=90)
        state = encrypt_json(
            {
                "aspsp": aspsp_name,
                "country": country,
                "psu_type": psu_type,
                "source_id": source_id,
            }
        ).decode()
        result = client.start_authorization(
            aspsp_name=aspsp_name,
            country=country,
            valid_until=(now + validity - timedelta(minutes=5)).isoformat(),
            redirect_url=get_settings().eb_redirect_url,
            state=state,
            psu_type=psu_type,
        )
    url = result.get("url")
    if not url:
        raise AuthorizationError("Enable Banking non ha restituito l'indirizzo della banca")
    return str(url)


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def complete_authorization(
    session: Session, *, code: str, state: str, client: EnableBankingClient | None = None
) -> AccountSource:
    """Dal codice restituito dalla banca alla sorgente con la sessione cifrata."""
    try:
        context = decrypt_json(state, ttl=STATE_TTL_SECONDS)
    except DecryptionError:
        raise AuthorizationError(
            "Collegamento scaduto o non valido: riparti da Impostazioni → Connessioni"
        ) from None
    own_client = client is None
    client = client or make_client()
    try:
        created = client.create_session(code)
        accounts = [session_account(a) for a in created.get("accounts") or []]
        aspsp = created.get("aspsp") or {"name": context["aspsp"], "country": context["country"]}
        valid_until = _parse_time((created.get("access") or {}).get("valid_until"))

        source = None
        if context.get("source_id"):
            source = session.get(AccountSource, int(context["source_id"]))
        if source is None:
            source = session.scalar(
                select(AccountSource)
                .where(
                    AccountSource.provider == Provider.ENABLEBANKING,
                    AccountSource.institution == aspsp["name"],
                )
                .order_by(AccountSource.id)
            )
        old_session_id = None
        if source is None:
            source = AccountSource(
                provider=Provider.ENABLEBANKING,
                institution=str(aspsp["name"]),
                display_name=str(aspsp["name"]),
                credentials_ref=CREDENTIALS_REF,
            )
            session.add(source)
        elif source.session_data_encrypted:
            try:
                old_session_id = decrypt_json(source.session_data_encrypted).get("session_id")
            except DecryptionError:
                old_session_id = None
        source.session_data_encrypted = encrypt_json(
            {
                "session_id": created["session_id"],
                "aspsp": {"name": aspsp["name"], "country": aspsp.get("country")},
                "psu_type": context.get("psu_type", "personal"),
                "accounts": accounts,
            }
        )
        source.consent_expires_at = valid_until
        source.status = SourceStatus.ACTIVE
        session.flush()
        if old_session_id and old_session_id != created["session_id"]:
            try:
                client.delete_session(str(old_session_id))
            except EnableBankingError as exc:  # la vecchia scade comunque da sola
                log.info("Revoca della sessione precedente non riuscita: %s", exc)
        return source
    finally:
        if own_client:
            client.close()


def disconnect(session: Session, source: AccountSource, *, delete_data: bool) -> int:
    """Revoca il consenso presso la banca (se possibile) e scollega la sorgente.
    `delete_data`: elimina anche conti e movimenti; altrimenti restano, la sorgente si
    disattiva e la sessione cifrata si cancella. Restituisce i movimenti eliminati."""
    from app.ingestion.mock_setup import remove_sources

    try:
        session_id = session_data(source).get("session_id")
    except AuthorizationError:
        session_id = None
    if session_id:
        try:
            with make_client() as client:
                client.delete_session(str(session_id))
        except EnableBankingError as exc:  # la sessione scade comunque da sola
            log.info("Revoca della sessione non riuscita: %s", exc)
    if delete_data:
        return remove_sources(session, [source.id]).transactions
    source.session_data_encrypted = None
    source.consent_expires_at = None
    source.status = SourceStatus.DISABLED
    session.flush()
    return 0


def session_data(source: AccountSource) -> dict[str, Any]:
    if not source.session_data_encrypted:
        raise AuthorizationError("Banca non ancora autorizzata: collega il conto")
    try:
        return decrypt_json(source.session_data_encrypted)
    except DecryptionError:
        raise AuthorizationError(
            "Sessione della banca illeggibile (chiave di cifratura cambiata?): ricollega il conto"
        ) from None
