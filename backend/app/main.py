"""Applicazione FastAPI.

Avvio in locale: `uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
Documentazione: http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any

from fastapi import Depends, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app import __version__
from app.api import (
    accounts,
    analytics,
    auth,
    banks,
    budgets,
    categories,
    health,
    investments,
    merchants,
    networth,
    recurring,
    rules,
    sync,
    transactions,
)
from app.auth.deps import require_auth
from app.backup.scheduler import BackupScheduler
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.db.session import get_sessionmaker
from app.demo import start_demo
from app.ingestion.scheduler import AutoSync
from app.models.enums import Provider
from app.web import mount_frontend

log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        configure_logging(settings)
        log.info("Backend avviato (ambiente: %s)", settings.app_env)
        auto_sync = None
        if settings.app_env != "test" and settings.demo_mode:
            start_demo(get_sessionmaker())
        if settings.app_env != "test":
            intervals = {
                Provider.TRADING212: timedelta(minutes=settings.t212_auto_sync_minutes),
                Provider.ENABLEBANKING: timedelta(hours=settings.eb_auto_sync_hours),
            }
            if settings.demo_mode:  # i dati di prova arrivano sempre fino a oggi
                intervals[Provider.MOCK] = timedelta(hours=6)
            auto_sync = AutoSync(get_sessionmaker(), intervals)
            auto_sync.start()
        backups = BackupScheduler(settings) if settings.app_env != "test" else None
        if backups is not None:
            backups.start()
        yield
        if auto_sync is not None:
            auto_sync.stop()
        if backups is not None:
            backups.stop()

    app = FastAPI(
        title="Finance Dashboard API",
        version=__version__,
        description="API privata della dashboard finanziaria. Integrazioni solo in lettura.",
        # Con l'accesso attivo la documentazione interattiva non si espone.
        docs_url=None if settings.auth_enabled else "/docs",
        redoc_url=None,
        openapi_url=None if settings.auth_enabled else "/api/openapi.json",
        lifespan=lifespan,
    )

    # Rifiuta richieste con Host diverso da quelli attesi: blocca il DNS rebinding,
    # cioè un sito esterno che prova a leggere l'API locale tramite il browser.
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(IntegrityError)
    async def integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
        # Nessun dettaglio SQL nella risposta: potrebbe contenere dati.
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        log.warning("Violazione di vincolo: %s", constraint)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": {"code": "conflict", "params": {}},
                "constraint": constraint,
            },
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next: Any) -> Any:
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "no-referrer")
        headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.path.startswith("/api/"):
            # Dati finanziari: mai in cache (browser o proxy).
            headers.setdefault("Cache-Control", "no-store")
        return response

    # Sempre raggiungibili: stato del sistema e accesso.
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    for router in (
        accounts.router,
        categories.router,
        transactions.router,
        transactions.transfers_router,
        transactions.tags_router,
        merchants.router,
        rules.router,
        analytics.router,
        budgets.router,
        investments.router,
        networth.router,
        banks.router,
        recurring.router,
        sync.router,
    ):
        app.include_router(router, prefix="/api", dependencies=[Depends(require_auth)])

    # Ultimo: le rotte dell'app (React) prendono tutto quello che non è /api.
    mount_frontend(app, settings.static_dir)
    return app


app = create_app()
