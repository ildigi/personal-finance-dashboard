"""Modalità demo (`DEMO_MODE=true`, il default): la dashboard si prova senza credenziali.

All'avvio del backend:
1. applica le migrazioni (database appena creato o da aggiornare);
2. se non ci sono categorie, applica il seed (categorie, merchant, regole);
3. se non c'è ancora nessuna sorgente, crea quelle di prova (Crédit Agricole, Revolut,
   Trading 212 finti) e le sincronizza: 15+ mesi di movimenti inventati fino a oggi;
4. a ogni avvio successivo risincronizza le sorgenti di prova, così i dati arrivano
   sempre fino a oggi.

Per usare la dashboard con i propri conti: `DEMO_MODE=false` e
`uv run python -m app.ingestion.cli mock-remove --yes` (toglie solo i dati di prova).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import AbstractContextManager

from alembic import command
from alembic.config import Config
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR
from app.db.seed import run_seed
from app.ingestion.mock_setup import ensure_mock_sources
from app.ingestion.runner import run_sync
from app.models import AccountSource, Category
from app.models.enums import Provider

log = logging.getLogger(__name__)


def upgrade_database() -> None:
    command.upgrade(Config(BACKEND_DIR / "alembic.ini"), "head")


def bootstrap_demo(session_factory: Callable[[], AbstractContextManager[Session]]) -> int:
    """Prepara il database della demo; restituisce quante sorgenti di prova ha sincronizzato."""
    with session_factory() as session:
        if not session.scalar(select(func.count()).select_from(Category)):
            report = run_seed(session)
            session.commit()
            log.info("Demo: seed applicato (%s)", report)
        if session.scalar(select(func.count()).select_from(AccountSource)) == 0:
            ensure_mock_sources(session)
            session.commit()
            log.info("Demo: create le sorgenti di prova")
        sources = list(
            session.scalars(select(AccountSource).where(AccountSource.provider == Provider.MOCK))
        )
        for source in sources:
            run_sync(session, source)
        return len(sources)


def start_demo(session_factory: Callable[[], AbstractContextManager[Session]]) -> None:
    """Migrazioni + dati di prova. Un errore non blocca l'avvio: resta nel log."""
    try:
        upgrade_database()
        synced = bootstrap_demo(session_factory)
        log.info("Demo pronta: %s sorgenti di prova sincronizzate", synced)
    except Exception:
        log.exception("Preparazione della demo non riuscita")
