"""Client HTTP dell'API pubblica di Trading 212 (v0). SOLO LETTURA.

Questo modulo, per progetto, sa fare una cosa sola: richieste `GET`. Non esistono
metodi per inviare, modificare o cancellare ordini o Pie, e `_get` rifiuta qualsiasi
percorso che non sia tra quelli di lettura elencati in `READ_ENDPOINTS` (un test lo
verifica). In più la chiave API va creata con i soli permessi di lettura (SPEC §9).

Limiti di frequenza: sono per conto e per endpoint. Il client distanzia le chiamate
allo stesso endpoint (con un `Pacer` condiviso tra più client dello stesso conto, ad es.
aggiornamento leggero e sincronizzazione) e, se il server risponde 429, aspetta il momento
indicato da `x-ratelimit-reset` (al massimo `MAX_WAIT_SECONDS`) e riprova.

Autenticazione: HTTP Basic con chiave (utente) e secret (password). La chiave non
compare mai nei log né nei messaggi d'errore.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import dotenv_values
from pydantic import SecretStr

log = logging.getLogger(__name__)

BASE_URLS = {
    "live": "https://live.trading212.com",
    "demo": "https://demo.trading212.com",
}
PREFIX = "/api/v0/equity"

# Endpoint di lettura usati dalla dashboard → secondi minimi tra due chiamate
# (dalla documentazione ufficiale: es. il riepilogo del conto 1 richiesta ogni 5 s).
READ_ENDPOINTS: dict[str, float] = {
    "/account/summary": 5.0,
    "/positions": 1.0,
    "/history/orders": 3.0,  # 20 al minuto
    "/history/dividends": 3.0,
    "/history/transactions": 3.0,
    "/pies": 30.0,
    "/pies/{id}": 5.0,
}
PAGE_LIMIT = 50  # massimo consentito
MAX_WAIT_SECONDS = 70.0
MAX_PAGES = 500
TIMEOUT = httpx.Timeout(20.0, connect=10.0)

Environment = Literal["live", "demo"]


class Trading212Error(RuntimeError):
    """Errore leggibile, senza dati sensibili (finisce nei log di sincronizzazione)."""


@dataclass(frozen=True)
class Credentials:
    api_key: SecretStr
    api_secret: SecretStr
    environment: Environment = "live"


def load_credentials(path: Path) -> Credentials:
    """Legge `T212_API_KEY`, `T212_API_SECRET`, `T212_ENV` dal file dei segreti."""
    if not path.is_file():
        raise Trading212Error(f"File delle credenziali Trading 212 non trovato: {path.name}")
    values = dotenv_values(path)
    key = (values.get("T212_API_KEY") or "").strip()
    secret = (values.get("T212_API_SECRET") or "").strip()
    env = (values.get("T212_ENV") or "live").strip().lower()
    if not key or not secret:
        raise Trading212Error("Chiave o secret di Trading 212 mancanti nel file delle credenziali")
    if env not in BASE_URLS:
        raise Trading212Error("T212_ENV deve essere 'live' oppure 'demo'")
    return Credentials(SecretStr(key), SecretStr(secret), env)  # type: ignore[arg-type]


class Pacer:
    """Distanzia le chiamate allo stesso endpoint. Sicuro tra thread: ogni chiamata prenota
    il suo turno sotto lock e aspetta fuori."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._next: dict[str, float] = {}
        self._lock = threading.Lock()

    def wait_time(self, key: str) -> float:
        """Prenota la prossima chiamata a `key` e dice quanto aspettare prima di farla."""
        with self._lock:
            now = self._clock()
            at = max(now, self._next.get(key, now))
            self._next[key] = at + READ_ENDPOINTS[key]
            return at - now


_SHARED_PACERS: dict[str, Pacer] = {}
_SHARED_GUARD = threading.Lock()


def shared_pacer(environment: str) -> Pacer:
    """Un solo `Pacer` per ambiente (= per conto) in tutto il processo."""
    with _SHARED_GUARD:
        return _SHARED_PACERS.setdefault(environment, Pacer())


def _endpoint_key(path: str) -> str:
    """'/pies/123' → '/pies/{id}' (per i limiti di frequenza e la lista consentita)."""
    parts = path.split("/")
    if len(parts) == 3 and parts[1] == "pies" and parts[2].isdigit():
        return "/pies/{id}"
    return path


class Trading212Client:
    """Solo `GET` verso gli endpoint di lettura. Usare come context manager."""

    def __init__(
        self,
        credentials: Credentials,
        *,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        wall_clock: Callable[[], float] = time.time,
        pacer: Pacer | None = None,
    ) -> None:
        self._http = httpx.Client(
            base_url=BASE_URLS[credentials.environment],
            auth=httpx.BasicAuth(
                credentials.api_key.get_secret_value(), credentials.api_secret.get_secret_value()
            ),
            timeout=TIMEOUT,
            transport=transport,
            headers={"Accept": "application/json", "User-Agent": "finance-dashboard (read-only)"},
            follow_redirects=False,
        )
        self.environment = credentials.environment
        self._sleep = sleep
        self._wall_clock = wall_clock
        self._pacer = pacer or Pacer(clock)

    def __enter__(self) -> Trading212Client:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    # --- Lettura ------------------------------------------------------------------------

    def account_summary(self) -> dict[str, Any]:
        return self._get_object("/account/summary")

    def positions(self) -> list[dict[str, Any]]:
        return self._get_list("/positions")

    def pies(self) -> list[dict[str, Any]]:
        return self._get_list("/pies")

    def pie(self, pie_id: int) -> dict[str, Any]:
        return self._get_object(f"/pies/{int(pie_id)}")

    def history_orders(self) -> Iterator[dict[str, Any]]:
        """Dal più recente al più vecchio, pagina per pagina."""
        return self._paginate("/history/orders")

    def history_dividends(self) -> Iterator[dict[str, Any]]:
        return self._paginate("/history/dividends")

    def history_transactions(self) -> Iterator[dict[str, Any]]:
        """Depositi, prelievi, interessi sulla liquidità, commissioni."""
        return self._paginate("/history/transactions")

    # --- Meccanica ----------------------------------------------------------------------

    def _get_object(self, path: str) -> dict[str, Any]:
        data = self._get(path)
        if not isinstance(data, dict):
            raise Trading212Error(f"Risposta inattesa da {_endpoint_key(path)}")
        return data

    def _get_list(self, path: str) -> list[dict[str, Any]]:
        data = self._get(path)
        if not isinstance(data, list):
            raise Trading212Error(f"Risposta inattesa da {_endpoint_key(path)}")
        return data

    def _paginate(self, path: str) -> Iterator[dict[str, Any]]:
        params: dict[str, Any] | None = {"limit": PAGE_LIMIT}
        next_path: str | None = None
        for _ in range(MAX_PAGES):
            page = self._get(path, params) if next_path is None else self._get_next(next_path)
            if not isinstance(page, dict):
                raise Trading212Error(f"Risposta inattesa da {path}")
            yield from page.get("items") or []
            next_path = page.get("nextPagePath")
            if not next_path:
                return
            params = None
        raise Trading212Error(f"Troppe pagine da {path}: interrotto per sicurezza")

    def _get_next(self, next_path: str) -> Any:
        """`nextPagePath` è un percorso completo con la query (es. `/api/v0/...?cursor=…`)."""
        url = httpx.URL(next_path)
        if url.host or not url.path.startswith(PREFIX):
            raise Trading212Error("Percorso di paginazione inatteso")
        return self._get(url.path[len(PREFIX) :], dict(url.params))

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        key = _endpoint_key(path)
        if key not in READ_ENDPOINTS:
            raise Trading212Error(f"Endpoint non consentito: {key}")
        for attempt in range(4):
            self._pace(key)
            try:
                response = self._http.request("GET", PREFIX + path, params=params)
            except httpx.HTTPError as exc:
                if attempt == 3:
                    raise Trading212Error(
                        f"Trading 212 non raggiungibile ({type(exc).__name__})"
                    ) from None
                self._sleep(2.0 * (attempt + 1))
                continue
            if response.status_code == 429 or response.status_code >= 500:
                if attempt == 3:
                    break
                self._sleep(self._retry_after(response, attempt))
                continue
            return self._parse(response, key)
        raise Trading212Error(
            f"Trading 212 non risponde ({response.status_code}) su {key}: riprova più tardi"
        )

    def _pace(self, key: str) -> None:
        wait = self._pacer.wait_time(key)
        if wait > 0:
            self._sleep(wait)

    def _retry_after(self, response: httpx.Response, attempt: int) -> float:
        reset = response.headers.get("x-ratelimit-reset")
        if response.status_code == 429 and reset:
            try:
                return min(max(float(reset) - self._wall_clock(), 1.0) + 0.5, MAX_WAIT_SECONDS)
            except ValueError:
                pass
        return min(5.0 * (attempt + 1), MAX_WAIT_SECONDS)

    @staticmethod
    def _parse(response: httpx.Response, key: str) -> Any:
        status = response.status_code
        if status == 401:
            raise Trading212Error("Chiave Trading 212 non valida o revocata (401)")
        if status == 403:
            raise Trading212Error(
                f"Permesso mancante per {key} (403): controlla i permessi di lettura della chiave"
                " o la restrizione IP"
            )
        if status == 404:
            raise Trading212Error(f"Risorsa non trovata su Trading 212: {key}")
        if status >= 400:
            raise Trading212Error(f"Errore {status} da Trading 212 su {key}")
        try:
            return response.json()
        except ValueError:
            raise Trading212Error(f"Risposta non valida da Trading 212 su {key}") from None
