"""Backup automatico mentre il backend è acceso (ogni `BACKUP_HOURS` ore)."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from app.backup.service import BackupError, create_backup, list_backups
from app.core.config import Settings

log = logging.getLogger(__name__)

CHECK_EVERY_SECONDS = 3600
#: Al primo controllo si aspetta un po': il backend appena avviato ha altro da fare.
FIRST_CHECK_SECONDS = 120


class BackupScheduler:
    def __init__(
        self, settings: Settings, *, now: Callable[[], datetime] = lambda: datetime.now(UTC)
    ) -> None:
        self._settings = settings
        self._interval = timedelta(hours=settings.backup_hours)
        self._now = now
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._interval <= timedelta(0):
            return
        self._thread = threading.Thread(target=self._loop, name="backup", daemon=True)
        self._thread.start()
        log.info("Backup automatico ogni %s", self._interval)

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def due(self) -> bool:
        files = list_backups(self._settings)
        return not files or self._now() - files[0].created_at >= self._interval

    def run_if_due(self) -> bool:
        if not self.due():
            return False
        try:
            create_backup(self._settings)
        except BackupError as exc:
            log.warning("Backup automatico non riuscito: %s", exc)
            return False
        return True

    def _loop(self) -> None:
        wait = FIRST_CHECK_SECONDS
        while not self._stop.wait(wait):
            wait = CHECK_EVERY_SECONDS
            try:
                self.run_if_due()
            except Exception:  # il thread non deve morire
                log.exception("Backup automatico: errore imprevisto")
