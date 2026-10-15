"""Un'operazione alla volta per sorgente, nello stesso processo.

La sincronizzazione completa (a mano o automatica) e l'aggiornamento leggero del
portafoglio usano gli stessi limiti di frequenza del broker e scrivono le stesse
istantanee: non devono sovrapporsi.
"""

from __future__ import annotations

import threading

_locks: dict[int, threading.Lock] = {}
_guard = threading.Lock()


def source_lock(source_id: int) -> threading.Lock:
    with _guard:
        return _locks.setdefault(source_id, threading.Lock())
