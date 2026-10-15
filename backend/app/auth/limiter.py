"""Freno ai tentativi di accesso sbagliati.

Un solo utente: il limite è globale (non per IP, che dietro un proxy sarebbe sempre lo
stesso). Dopo `MAX_FAILURES` errori in `WINDOW` l'accesso si blocca fino a che il più
vecchio errore esce dalla finestra.
"""

from __future__ import annotations

import threading
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

MAX_FAILURES = 5
WINDOW = timedelta(minutes=15)


class LoginLimiter:
    def __init__(self, now: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
        self._now = now
        self._failures: deque[datetime] = deque()
        self._lock = threading.Lock()

    def _prune(self, now: datetime) -> None:
        while self._failures and now - self._failures[0] >= WINDOW:
            self._failures.popleft()

    def retry_after(self) -> int:
        """Secondi da aspettare prima di riprovare (0 = si può provare)."""
        with self._lock:
            now = self._now()
            self._prune(now)
            if len(self._failures) < MAX_FAILURES:
                return 0
            return max(1, int((self._failures[0] + WINDOW - now).total_seconds()))

    def failure(self) -> None:
        with self._lock:
            self._failures.append(self._now())

    def success(self) -> None:
        with self._lock:
            self._failures.clear()


limiter = LoginLimiter()
