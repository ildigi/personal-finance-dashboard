"""Client HTTP di Enable Banking (Open Banking PSD2), solo **AIS**: informazioni sui conti.

Per progetto il client conosce un elenco chiuso di endpoint (`ENDPOINTS`): la lettura di
banche, conti, saldi e movimenti, più le tre operazioni sul *consenso* (avviarlo, creare la
sessione dopo il ritorno dalla banca, revocarla). Nessun endpoint di pagamento (PIS): ogni
percorso fuori elenco viene rifiutato prima di partire (un test lo verifica). Inoltre
l'applicazione nel Control Panel ha solo l'accesso ai dati dei conti.

Autenticazione: ogni richiesta porta un JWT firmato RS256 con la chiave privata
dell'applicazione (`kid` = application ID), valido al massimo un'ora.

Credenziali: `${DATA_DIR}/secrets/enablebanking.env` (`EB_APPLICATION_ID`, `EB_ENV`,
`EB_KEY_FILE`) e la chiave privata nello stesso file indicato da `EB_KEY_FILE`. Né la
chiave né i token compaiono mai nei log o nei messaggi d'errore.

Limiti: senza l'utente presente molte banche concedono al massimo 4 letture al giorno per
conto. Le sincronizzazioni fatte a mano passano le intestazioni `Psu-*` (utente presente).
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import jwt
from dotenv import dotenv_values
from pydantic import SecretStr

from app.core.logging import mask_iban

log = logging.getLogger(__name__)

BASE_URL = "https://api.enablebanking.com"
JWT_LIFETIME_SECONDS = 3600
JWT_RENEW_BEFORE_SECONDS = 300
TIMEOUT = httpx.Timeout(30.0, connect=10.0)
MAX_PAGES = 200
MAX_WAIT_SECONDS = 30.0

# (metodo, percorso normalizzato) consentiti. Nessun /payments.
ENDPOINTS: frozenset[tuple[str, str]] = frozenset(
    {
        ("GET", "/aspsps"),
        ("POST", "/auth"),
        ("POST", "/sessions"),
        ("GET", "/sessions/{id}"),
        ("DELETE", "/sessions/{id}"),
        ("GET", "/accounts/{id}/details"),
        ("GET", "/accounts/{id}/balances"),
        ("GET", "/accounts/{id}/transactions"),
    }
)

_ID = re.compile(r"^[A-Za-z0-9-]{8,}$")


class EnableBankingError(RuntimeError):
    """Errore leggibile, senza dati sensibili (finisce nei log di sincronizzazione)."""


class ConsentExpiredError(EnableBankingError):
    """Sessione scaduta o revocata: va rinnovato il consenso presso la banca."""


@dataclass(frozen=True)
class Credentials:
    application_id: str
    private_key: SecretStr
    environment: str = "sandbox"


def load_credentials(env_file: Path) -> Credentials:
    if not env_file.is_file():
        raise EnableBankingError(
            f"File delle credenziali Enable Banking non trovato: {env_file.name}"
        )
    values = dotenv_values(env_file)
    app_id = (values.get("EB_APPLICATION_ID") or "").strip()
    key_name = (values.get("EB_KEY_FILE") or "enablebanking.pem").strip()
    environment = (values.get("EB_ENV") or "sandbox").strip().lower()
    if not app_id:
        raise EnableBankingError("EB_APPLICATION_ID mancante nel file delle credenziali")
    if environment not in ("sandbox", "production"):
        raise EnableBankingError("EB_ENV deve essere 'sandbox' oppure 'production'")
    key_path = env_file.parent / Path(key_name).name  # solo nella cartella dei segreti
    if not key_path.is_file():
        raise EnableBankingError(f"Chiave privata Enable Banking non trovata: {key_path.name}")
    key = key_path.read_text(encoding="utf-8")
    if "PRIVATE KEY" not in key:
        raise EnableBankingError("Il file della chiave non contiene una chiave privata")
    return Credentials(app_id, SecretStr(key), environment)


def endpoint_key(path: str) -> str:
    """'/accounts/3f…/balances' → '/accounts/{id}/balances'."""
    parts = path.split("/")
    if len(parts) >= 3 and parts[1] in ("sessions", "accounts") and _ID.match(parts[2]):
        parts[2] = "{id}"
    return "/".join(parts)


class EnableBankingClient:
    def __init__(
        self,
        credentials: Credentials,
        *,
        transport: httpx.BaseTransport | None = None,
        psu_headers: dict[str, str] | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._credentials = credentials
        self._http = httpx.Client(
            base_url=BASE_URL,
            timeout=TIMEOUT,
            transport=transport,
            headers={"Accept": "application/json", "User-Agent": "finance-dashboard (AIS)"},
            follow_redirects=False,
        )
        self._psu_headers = dict(psu_headers or {})
        self._sleep = sleep
        self._clock = clock
        self._token: str | None = None
        self._token_expires = 0.0
        self.environment = credentials.environment

    def __enter__(self) -> EnableBankingClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    # --- Banche e consenso ------------------------------------------------------------

    def aspsps(self, country: str) -> list[dict[str, Any]]:
        data = self._request("GET", "/aspsps", params={"country": country})
        return list(data.get("aspsps") or [])

    def start_authorization(
        self,
        *,
        aspsp_name: str,
        country: str,
        valid_until: str,
        redirect_url: str,
        state: str,
        psu_type: str = "personal",
        language: str = "it",
    ) -> dict[str, Any]:
        """Avvia il consenso: restituisce l'URL della banca dove fare login e SCA."""
        return self._request(
            "POST",
            "/auth",
            json={
                "access": {"valid_until": valid_until},
                "aspsp": {"name": aspsp_name, "country": country},
                "state": state,
                "redirect_url": redirect_url,
                "psu_type": psu_type,
                "language": language,
            },
        )

    def create_session(self, code: str) -> dict[str, Any]:
        """Dopo il ritorno dalla banca: il codice diventa una sessione con i conti autorizzati."""
        return self._request("POST", "/sessions", json={"code": code})

    def get_session(self, session_id: str) -> dict[str, Any]:
        return self._request("GET", f"/sessions/{session_id}")

    def delete_session(self, session_id: str) -> None:
        """Revoca il consenso (es. quando lo si rinnova)."""
        self._request("DELETE", f"/sessions/{session_id}")

    # --- Conti --------------------------------------------------------------------------

    def account_details(self, uid: str) -> dict[str, Any]:
        return self._request("GET", f"/accounts/{uid}/details", psu=True)

    def balances(self, uid: str) -> list[dict[str, Any]]:
        data = self._request("GET", f"/accounts/{uid}/balances", psu=True)
        return list(data.get("balances") or [])

    def transactions(self, uid: str, date_from: str) -> Iterator[dict[str, Any]]:
        params: dict[str, Any] = {"date_from": date_from}
        for _ in range(MAX_PAGES):
            page = self._request("GET", f"/accounts/{uid}/transactions", params=params, psu=True)
            yield from page.get("transactions") or []
            key = page.get("continuation_key")
            if not key:
                return
            params = {"date_from": date_from, "continuation_key": key}
        raise EnableBankingError("Troppe pagine di movimenti: interrotto per sicurezza")

    # --- Meccanica ----------------------------------------------------------------------

    def _jwt(self) -> str:
        now = self._clock()
        if self._token is None or now > self._token_expires - JWT_RENEW_BEFORE_SECONDS:
            iat = int(now)
            self._token = jwt.encode(
                {
                    "iss": "enablebanking.com",
                    "aud": "api.enablebanking.com",
                    "iat": iat,
                    "exp": iat + JWT_LIFETIME_SECONDS,
                },
                self._credentials.private_key.get_secret_value(),
                algorithm="RS256",
                headers={"kid": self._credentials.application_id},
            )
            self._token_expires = iat + JWT_LIFETIME_SECONDS
        return self._token

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        psu: bool = False,
    ) -> dict[str, Any]:
        key = endpoint_key(path)
        if (method, key) not in ENDPOINTS:
            raise EnableBankingError(f"Endpoint non consentito: {method} {key}")
        headers = {"Authorization": f"Bearer {self._jwt()}"}
        if psu:
            headers.update(self._psu_headers)
        response: httpx.Response | None = None
        for attempt in range(3):
            try:
                response = self._http.request(
                    method, path, params=params, json=json, headers=headers
                )
            except httpx.HTTPError as exc:
                if attempt == 2:
                    raise EnableBankingError(
                        f"Enable Banking non raggiungibile ({type(exc).__name__})"
                    ) from None
                self._sleep(2.0 * (attempt + 1))
                continue
            if response.status_code >= 500 and attempt < 2:
                self._sleep(3.0 * (attempt + 1))
                continue
            break
        if response is None:  # pragma: no cover - il ciclo assegna sempre o solleva
            raise EnableBankingError(f"Nessuna risposta da {key}")
        return self._parse(response, method, key)

    @staticmethod
    def _detail(response: httpx.Response) -> str:
        """Messaggio dell'errore, ripulito: niente IBAN, lunghezza limitata."""
        try:
            body = response.json()
        except ValueError:
            return ""
        if not isinstance(body, dict):
            return ""
        parts = [str(body[k]) for k in ("error", "message") if body.get(k)]
        return mask_iban(" – ".join(parts))[:200]

    @classmethod
    def _parse(cls, response: httpx.Response, method: str, key: str) -> dict[str, Any]:
        status = response.status_code
        if status < 300:
            if not response.content:
                return {}
            try:
                data = response.json()
            except ValueError:
                raise EnableBankingError(f"Risposta non valida da {key}") from None
            if not isinstance(data, dict):
                raise EnableBankingError(f"Risposta inattesa da {key}")
            return data
        detail = cls._detail(response)
        suffix = f": {detail}" if detail else ""
        if status == 401 and key.startswith(("/accounts", "/sessions/")):
            raise ConsentExpiredError(f"Consenso scaduto o revocato, va rinnovato{suffix}")
        if status == 401:
            raise EnableBankingError(f"Applicazione Enable Banking non autorizzata (401){suffix}")
        if status == 403:
            raise ConsentExpiredError(f"Accesso negato dalla banca (403){suffix}")
        if status == 429:
            raise EnableBankingError(
                "Limite di accessi raggiunto (429): la banca concede poche letture al giorno"
                + suffix
            )
        if status == 422 and key.endswith("/transactions"):
            raise EnableBankingError(f"Periodo dei movimenti non accettato dalla banca{suffix}")
        raise EnableBankingError(f"Errore {status} da Enable Banking su {method} {key}{suffix}")
