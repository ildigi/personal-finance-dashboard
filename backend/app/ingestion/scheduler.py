"""Sincronizzazione automatica mentre il backend è acceso (SPEC §8, §13).

Un thread controlla ogni minuto le sorgenti attive e sincronizza quelle la cui ultima
sincronizzazione (o tentativo fallito) è più vecchia dell'intervallo del loro provider:
Trading 212 ogni `T212_AUTO_SYNC_MINUTES`, le banche ogni `EB_AUTO_SYNC_HOURS` (almeno 6
ore: senza utente presente le banche concedono 4 letture al giorno). 0 = spenta. Così un
riavvio del backend non provoca una sincronizzazione se l'ultima è recente, e un errore non
viene ritentato ogni minuto. Le banche col consenso scaduto si saltano. Spenta nei test.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.runner import run_sync
from app.models import AccountSource
from app.models.enums import Provider, SourceStatus

log = logging.getLogger(__name__)

CHECK_EVERY_SECONDS = 60.0


class AutoSync:
    def __init__(
        self,
        session_factory: Callable[[], AbstractContextManager[Session]],
        intervals: dict[Provider, timedelta],
        *,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._session_factory = session_factory
        self._intervals = {p: i for p, i in intervals.items() if i > timedelta(0)}
        self._now = now
        self._attempts: dict[int, datetime] = {}
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._loop, name="auto-sync", daemon=True)
        self._thread.start()
        for provider, interval in self._intervals.items():
            log.info("Sincronizzazione automatica %s ogni %s", provider.value, interval)

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def _loop(self) -> None:
        while not self._stop.wait(CHECK_EVERY_SECONDS):
            try:
                self.run_due()
            except Exception:  # il thread non deve morire per un errore imprevisto
                log.exception("Sincronizzazione automatica non riuscita")

    def _due(self, source: AccountSource, now: datetime) -> bool:
        last = max(
            (t for t in (source.last_sync_at, self._attempts.get(source.id)) if t is not None),
            default=None,
        )
        return last is None or now - last >= self._intervals[Provider(source.provider)]

    def run_due(self) -> list[int]:
        """Sincronizza le sorgenti scadute; restituisce i loro id."""
        done: list[int] = []
        if not self._intervals:
            return done
        with self._session_factory() as session:
            sources = session.scalars(
                select(AccountSource).where(
                    AccountSource.provider.in_([p.value for p in self._intervals]),
                    AccountSource.status.not_in(
                        [SourceStatus.DISABLED.value, SourceStatus.EXPIRED.value]
                    ),
                )
            ).all()
            for source in sources:
                now = self._now()
                if self._stop.is_set() or not self._due(source, now):
                    continue
                self._attempts[source.id] = now
                summary = run_sync(session, source)
                log.info("Sincronizzazione automatica %s: %s", source.id, summary.status)
                done.append(source.id)
        return done
