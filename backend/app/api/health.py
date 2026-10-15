from __future__ import annotations

import logging
from functools import lru_cache
from typing import Literal

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import __version__
from app.api.deps import DbSession
from app.core.config import BACKEND_DIR, get_settings

router = APIRouter(tags=["health"])
log = logging.getLogger(__name__)


class DatabaseHealth(BaseModel):
    ok: bool
    migration_current: str | None = None
    migration_head: str | None = None
    up_to_date: bool = False


class Health(BaseModel):
    status: Literal["ok", "degraded", "error"]
    version: str
    environment: str
    database: DatabaseHealth


@lru_cache
def _migration_head() -> str | None:
    return ScriptDirectory.from_config(Config(BACKEND_DIR / "alembic.ini")).get_current_head()


@router.get("/health", response_model=Health)
def health(session: DbSession, response: Response) -> Health:
    """Stato del backend e del database (connessione e migrazioni applicate)."""
    db = DatabaseHealth(ok=False, migration_head=_migration_head())
    try:
        session.execute(text("SELECT 1"))
        db.ok = True
        db.migration_current = session.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one_or_none()
    except SQLAlchemyError as exc:
        session.rollback()
        log.warning("Health check database fallito: %s", type(exc).__name__)

    db.up_to_date = db.ok and db.migration_current == db.migration_head
    if not db.ok:
        overall: Literal["ok", "degraded", "error"] = "error"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    else:
        overall = "ok" if db.up_to_date else "degraded"

    return Health(
        status=overall,
        version=__version__,
        environment=get_settings().app_env,
        database=db,
    )
