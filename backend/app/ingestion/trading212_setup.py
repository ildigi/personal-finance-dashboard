"""Collegamento del conto Trading 212 vero (Fase 7).

La sorgente nel database contiene solo un riferimento al file dei segreti
(`secrets:trading212.env`), mai la chiave: chiave e secret restano in
`${DATA_DIR}/secrets/trading212.env`, fuori dal repository (SPEC §9 e §15).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.registry import TRADING212_CREDENTIALS_REF, trading212_credentials_path
from app.integrations.trading212.client import Trading212Error, load_credentials
from app.models import AccountSource
from app.models.enums import Provider, SourceStatus


def credentials_available() -> bool:
    try:
        load_credentials(trading212_credentials_path())
    except Trading212Error:
        return False
    return True


def find_trading212_source(session: Session) -> AccountSource | None:
    return session.scalar(
        select(AccountSource)
        .where(AccountSource.provider == Provider.TRADING212)
        .order_by(AccountSource.id)
    )


def ensure_trading212_source(session: Session) -> AccountSource:
    """Crea la sorgente se manca (e la riattiva se era disattivata). Non contatta Trading 212."""
    load_credentials(trading212_credentials_path())  # errore chiaro se il file non va
    source = find_trading212_source(session)
    if source is None:
        source = AccountSource(
            provider=Provider.TRADING212,
            institution="Trading 212",
            display_name="Trading 212 Invest",
            credentials_ref=TRADING212_CREDENTIALS_REF,
        )
        session.add(source)
    elif source.status == SourceStatus.DISABLED:
        source.status = SourceStatus.ACTIVE
    session.flush()
    return source
