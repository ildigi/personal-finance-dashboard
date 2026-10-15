"""Sceglie il connettore giusto per una sorgente."""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

from app.core.config import get_settings
from app.integrations.base import BankConnector, BrokerConnector
from app.integrations.mock.connector import MockBankConnector, MockBrokerConnector
from app.integrations.trading212.client import (
    Trading212Client,
    Trading212Error,
    load_credentials,
    shared_pacer,
)
from app.integrations.trading212.connector import Trading212Connector
from app.models import AccountSource
from app.models.enums import Provider

MOCK_BANKS = {"mock:credit_agricole": "credit_agricole", "mock:revolut": "revolut"}
MOCK_BROKER = "mock:trading212"
TRADING212_SECRETS_FILE = "trading212.env"
TRADING212_CREDENTIALS_REF = f"secrets:{TRADING212_SECRETS_FILE}"


class ConnectorUnavailableError(RuntimeError):
    pass


class ConsentRequiredError(ConnectorUnavailableError):
    """Il consenso presso la banca manca o è scaduto: va (ri)autorizzato."""


def is_broker(source: AccountSource) -> bool:
    return source.provider == Provider.TRADING212 or source.credentials_ref == MOCK_BROKER


def connector_for(
    source: AccountSource, today: date, *, psu_headers: dict[str, str] | None = None
) -> BankConnector | BrokerConnector:
    """`psu_headers`: intestazioni "utente presente" per le banche (sync fatta a mano)."""
    if source.provider == Provider.MOCK:
        if source.credentials_ref == MOCK_BROKER:
            return MockBrokerConnector(today)
        bank = MOCK_BANKS.get(source.credentials_ref or "")
        if bank == "credit_agricole":
            return MockBankConnector("credit_agricole", today)
        if bank == "revolut":
            return MockBankConnector("revolut", today)
        raise ConnectorUnavailableError(f"Sorgente di prova sconosciuta: {source.credentials_ref}")
    if source.provider == Provider.MANUAL:
        raise ConnectorUnavailableError("Le sorgenti manuali non si sincronizzano")
    if source.provider == Provider.TRADING212:
        try:
            credentials = load_credentials(trading212_credentials_path())
        except Trading212Error as exc:
            raise ConnectorUnavailableError(str(exc)) from exc
        client = Trading212Client(credentials, pacer=shared_pacer(credentials.environment))
        return Trading212Connector(client)
    if source.provider == Provider.ENABLEBANKING:
        return _enablebanking_connector(source, psu_headers)
    raise ConnectorUnavailableError(f"Connettore sconosciuto: {source.provider}")


def _enablebanking_connector(
    source: AccountSource, psu_headers: dict[str, str] | None
) -> BankConnector:
    # Import qui: il setup sta nell'ingestione, che a sua volta usa questo registro.
    from app.ingestion import enablebanking_setup as setup
    from app.integrations.enablebanking.client import EnableBankingError
    from app.integrations.enablebanking.connector import EnableBankingConnector

    expires = source.consent_expires_at
    if expires is not None and expires <= datetime.now(UTC):
        raise ConsentRequiredError("Consenso della banca scaduto: rinnovalo da Impostazioni")
    try:
        data = setup.session_data(source)
        client = setup.make_client(psu_headers)
    except setup.AuthorizationError as exc:
        raise ConsentRequiredError(str(exc)) from exc
    except EnableBankingError as exc:
        raise ConnectorUnavailableError(str(exc)) from exc
    return EnableBankingConnector(client, data)


def trading212_credentials_path() -> Path:
    """Chiave e secret stanno fuori dal repository, nella cartella dei segreti (SPEC §9)."""
    return get_settings().secrets_dir / TRADING212_SECRETS_FILE
