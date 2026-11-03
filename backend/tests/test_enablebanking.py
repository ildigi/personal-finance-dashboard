"""Enable Banking: client solo AIS, traduzione dei dati, consenso, sincronizzazione.

Nessun test contatta Enable Banking: le risposte sono finte (con la forma documentata) e
passano da `httpx.MockTransport` o da un client finto. Chiave RSA generata al volo.
"""

from __future__ import annotations

import inspect
import json
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import crypto
from app.core.config import Settings
from app.ingestion import enablebanking_setup as setup
from app.ingestion.runner import run_sync
from app.ingestion.scheduler import AutoSync
from app.integrations.enablebanking import client as eb_client
from app.integrations.enablebanking.client import (
    ConsentExpiredError,
    Credentials,
    EnableBankingClient,
    EnableBankingError,
    endpoint_key,
    load_credentials,
)
from app.integrations.enablebanking.connector import EnableBankingConnector, session_account
from app.integrations.mock.scenario import mock_iban
from app.models import Account, AccountSource, Balance, Transaction
from app.models.enums import Provider

APP_ID = "00000000-1111-2222-3333-444444444444"
UID_A = "aaaaaaaa-0000-0000-0000-000000000001"
UID_B = "bbbbbbbb-0000-0000-0000-000000000002"
DAY = date(2026, 10, 6)
FAKE_IBAN = mock_iban("IT", 0)  # IBAN fittizio a zeri


def _private_key() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


PEM = _private_key()
CREDS = Credentials(APP_ID, SecretStr(PEM), "sandbox")

# --- Risposte finte, con la forma documentata ------------------------------------------------

ASPSPS = [
    {
        "name": "Mock ASPSP",
        "country": "IT",
        "logo": "https://example.invalid/logo.png",
        "psu_types": ["business", "personal"],
        "maximum_consent_validity": 15552000,
        "beta": False,
        "sandbox": None,
        "bic": None,
        "auth_methods": [],
    }
]
SESSION: dict[str, Any] = {
    "session_id": "sess-0001-0000-0000-000000000000",
    "accounts": [
        {
            "uid": UID_A,
            "identification_hash": "hash-conto-corrente",
            "account_id": {"iban": FAKE_IBAN},
            "name": "MARIO ROSSI",
            "currency": "EUR",
            "cash_account_type": "CACC",
            "product": "Conto corrente",
            "details": None,
            "usage": "PRIV",
        },
        {
            "uid": UID_B,
            "identification_hash": "hash-carta",
            "account_id": {"iban": None},
            "name": None,
            "product": "Carta di credito",
            "currency": "EUR",
            "cash_account_type": "CARD",
            "usage": "PRIV",
        },
    ],
    "access": {"valid_until": "2027-04-04T10:00:00+00:00"},
    "aspsp": {"name": "Mock ASPSP", "country": "IT"},
}
BALANCES = [
    {
        "balance_amount": {"amount": "1520.40", "currency": "EUR"},
        "balance_type": "CLBD",
        "reference_date": "2026-10-05",
    },
    {
        "balance_amount": {"amount": "1490.40", "currency": "EUR"},
        "balance_type": "ITAV",
        "reference_date": "2026-10-06",
    },
    {
        "balance_amount": {"amount": "1.00", "currency": "EUR"},
        "balance_type": "OPBD",  # meno preferito di CLBD
        "reference_date": "2026-10-01",
    },
]


def _tx(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "entry_reference": "ref-1",
        "transaction_amount": {"amount": "12.50", "currency": "EUR"},
        "credit_debit_indicator": "DBIT",
        "status": "BOOK",
        "booking_date": "2026-10-03",
        "value_date": "2026-10-03",
        "creditor": {"name": "BAR CENTRALE"},
        "debtor": {"name": "MARIO ROSSI"},
        "creditor_account": {"iban": None},
        "remittance_information": ["PAGAMENTO POS BAR CENTRALE"],
        "bank_transaction_code": {"description": "Card payment"},
        "merchant_category_code": "5812",
    }
    return {**base, **overrides}


TRANSACTIONS = [
    _tx(),
    _tx(
        entry_reference="ref-2",
        transaction_amount={"amount": "1800.00", "currency": "EUR"},
        credit_debit_indicator="CRDT",
        remittance_information=["STIPENDIO OTTOBRE"],
        debtor={"name": "ACME SPA"},
        merchant_category_code=None,
        booking_date="2026-10-01",
    ),
    _tx(
        entry_reference=None,
        status="PDNG",
        booking_date=None,
        transaction_date="2026-10-05",
        remittance_information=[],
        creditor={"name": "AMAZON"},
        transaction_amount={"amount": "30.00", "currency": "EUR"},
    ),
    _tx(entry_reference="ref-x", status="CANC"),  # annullato: ignorato
]


class FakeEBClient:
    """Stessa interfaccia di `EnableBankingClient`, risposte finte."""

    def __init__(self, **overrides: Any) -> None:
        self.data: dict[str, Any] = {
            "aspsps": ASPSPS,
            "session": SESSION,
            "balances": {UID_A: BALANCES, UID_B: []},
            "transactions": {UID_A: TRANSACTIONS, UID_B: []},
            **overrides,
        }
        self.deleted: list[str] = []
        self.authorizations: list[dict[str, Any]] = []
        self.closed = False

    def aspsps(self, country: str) -> list[dict[str, Any]]:
        return list(self.data["aspsps"])

    def start_authorization(self, **kwargs: Any) -> dict[str, Any]:
        self.authorizations.append(kwargs)
        return {"url": "https://tilisy-sandbox.enablebanking.com/ais/start?x=1"}

    def create_session(self, code: str) -> dict[str, Any]:
        if code == "bad":
            raise EnableBankingError("Errore 422 da Enable Banking su POST /sessions")
        session: dict[str, Any] = json.loads(json.dumps(self.data["session"]))
        return session

    def delete_session(self, session_id: str) -> None:
        self.deleted.append(session_id)

    def balances(self, uid: str) -> list[dict[str, Any]]:
        if self.data.get("expired"):
            raise ConsentExpiredError("Consenso scaduto o revocato, va rinnovato")
        return list(self.data["balances"][uid])

    def transactions(self, uid: str, date_from: str) -> Iterator[dict[str, Any]]:
        return iter(self.data["transactions"][uid])

    def close(self) -> None:
        self.closed = True

    def __enter__(self) -> FakeEBClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


# --- Client: solo AIS ---------------------------------------------------------------------------


def _client(
    handler: Callable[[httpx.Request], httpx.Response], **kwargs: Any
) -> EnableBankingClient:
    return EnableBankingClient(
        CREDS, transport=httpx.MockTransport(handler), sleep=lambda s: None, **kwargs
    )


def test_client_surface_is_ais_only() -> None:
    public = {
        name
        for name, _ in inspect.getmembers(EnableBankingClient, predicate=inspect.isfunction)
        if not name.startswith("_")
    }
    assert public == {
        "aspsps",
        "start_authorization",
        "create_session",
        "get_session",
        "delete_session",
        "account_details",
        "balances",
        "transactions",
        "close",
    }
    assert not any("payment" in path for _, path in eb_client.ENDPOINTS)
    # Le sole scritture sono sul consenso, mai sui conti.
    writes = {(m, p) for m, p in eb_client.ENDPOINTS if m != "GET"}
    assert writes == {("POST", "/auth"), ("POST", "/sessions"), ("DELETE", "/sessions/{id}")}


def test_payments_and_unknown_paths_are_refused_before_any_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("nessuna richiesta deve partire")

    with _client(handler) as c:
        for method, path in (
            ("POST", "/payments"),
            ("GET", "/payments/abc12345"),
            ("POST", "/accounts/aaaaaaaa-0000/transactions"),
            ("GET", "/application"),
        ):
            with pytest.raises(EnableBankingError, match=r"bank\.endpoint_forbidden"):
                c._request(method, path)


def test_every_request_is_signed_with_a_short_lived_jwt() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"aspsps": ASPSPS})

    with _client(handler, clock=lambda: 1_800_000_000.0) as c:
        assert c.aspsps("IT")[0]["name"] == "Mock ASPSP"
    token = seen[0].headers["Authorization"].removeprefix("Bearer ")
    header = jwt.get_unverified_header(token)
    assert (header["alg"], header["kid"]) == ("RS256", APP_ID)
    public = serialization.load_pem_private_key(PEM.encode(), None).public_key()
    claims = jwt.decode(
        token,
        public,  # type: ignore[arg-type]
        algorithms=["RS256"],
        audience="api.enablebanking.com",
        options={"verify_exp": False, "verify_iat": False},
    )
    assert claims["iss"] == "enablebanking.com"
    assert claims["exp"] - claims["iat"] <= 3600
    assert seen[0].url.host == "api.enablebanking.com"


def test_psu_headers_only_on_account_reads() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("/balances"):
            return httpx.Response(200, json={"balances": BALANCES})
        return httpx.Response(200, json={"aspsps": []})

    with _client(handler, psu_headers={"Psu-User-Agent": "Browser"}) as c:
        c.aspsps("IT")
        c.balances(UID_A)
    assert "Psu-User-Agent" not in seen[0].headers
    assert seen[1].headers["Psu-User-Agent"] == "Browser"


def test_transactions_follow_continuation_key() -> None:
    pages = {
        None: {"transactions": [{"n": 1}, {"n": 2}], "continuation_key": "k2"},
        "k2": {"transactions": [{"n": 3}], "continuation_key": None},
    }
    seen: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        seen.append(params)
        return httpx.Response(200, json=pages[params.get("continuation_key")])

    with _client(handler) as c:
        assert [t["n"] for t in c.transactions(UID_A, "2026-01-01")] == [1, 2, 3]
    assert seen == [
        {"date_from": "2026-01-01"},
        {"date_from": "2026-01-01", "continuation_key": "k2"},
    ]


@pytest.mark.parametrize(
    ("status", "path", "error", "message"),
    [
        (401, f"/accounts/{UID_A}/balances", ConsentExpiredError, r"bank\.consent_revoked"),
        (403, f"/accounts/{UID_A}/balances", ConsentExpiredError, r"bank\.access_denied"),
        (401, "/aspsps", EnableBankingError, r"bank\.app_unauthorized"),
        (429, f"/accounts/{UID_A}/balances", EnableBankingError, r"bank\.rate_limited"),
        (500, "/aspsps", EnableBankingError, r"bank\.http_error.*500"),
    ],
)
def test_errors_are_readable_and_masked(
    status: int, path: str, error: type[Exception], message: str
) -> None:
    body = {"error": "ERR", "message": f"account {FAKE_IBAN} not allowed"}
    with _client(lambda r: httpx.Response(status, json=body)) as c, pytest.raises(error) as exc:
        c._request("GET", path)
    assert exc.match(message)
    assert FAKE_IBAN not in str(exc.value)
    assert "BEGIN" not in str(exc.value)


def test_endpoint_key() -> None:
    assert endpoint_key(f"/accounts/{UID_A}/transactions") == "/accounts/{id}/transactions"
    assert endpoint_key("/sessions/sess-0001-0000") == "/sessions/{id}"
    assert endpoint_key("/aspsps") == "/aspsps"


def test_load_credentials(tmp_path: Path) -> None:
    env = tmp_path / "enablebanking.env"
    with pytest.raises(EnableBankingError, match=r"bank\.credentials_missing"):
        load_credentials(env)
    env.write_text("EB_ENV=sandbox\n", encoding="utf-8")
    with pytest.raises(EnableBankingError, match="EB_APPLICATION_ID"):
        load_credentials(env)
    env.write_text(f"EB_APPLICATION_ID={APP_ID}\nEB_KEY_FILE=../fuori.pem\n", encoding="utf-8")
    with pytest.raises(EnableBankingError, match=r"bank\.private_key_missing"):
        load_credentials(env)  # il percorso resta nella cartella dei segreti
    (tmp_path / "fuori.pem").write_text(PEM, encoding="utf-8")
    creds = load_credentials(env)
    assert (creds.application_id, creds.environment) == (APP_ID, "sandbox")
    assert "BEGIN" not in repr(creds)


# --- Connettore: traduzione dei dati ------------------------------------------------------------


def _connector(**overrides: Any) -> EnableBankingConnector:
    data = {
        "session_id": SESSION["session_id"],
        "aspsp": SESSION["aspsp"],
        "accounts": [session_account(a) for a in SESSION["accounts"]],
    }
    return EnableBankingConnector(FakeEBClient(**overrides), data)  # type: ignore[arg-type]


def test_accounts_use_stable_ids_and_types() -> None:
    current, card = _connector().list_accounts()
    assert (current.external_id, current.type, current.institution) == (
        "hash-conto-corrente",
        "checking",
        "Mock ASPSP",
    )
    assert current.iban == FAKE_IBAN
    # Il campo `name` della banca è l'intestatario: il nome del conto viene dal prodotto.
    assert current.name == "Conto corrente"
    assert (card.external_id, card.type, card.name) == (
        "hash-carta",
        "credit_card",
        "Carta di credito",
    )


def test_balances_prefer_closing_booked_and_interim_available() -> None:
    booked, available = _connector().get_balances("hash-conto-corrente")
    assert (booked.balance_type, booked.amount, booked.as_of) == (
        "booked",
        Decimal("1520.40"),
        date(2026, 10, 5),
    )
    assert (available.balance_type, available.amount) == ("available", Decimal("1490.40"))


def test_transactions_sign_status_and_counterparty() -> None:
    pos, salary, pending = _connector().get_transactions("hash-conto-corrente", date(2026, 1, 1))
    assert (pos.amount, pos.status, pos.counterparty_name, pos.mcc) == (
        Decimal("-12.50"),
        "booked",
        "BAR CENTRALE",
        "5812",
    )
    assert pos.description == "PAGAMENTO POS BAR CENTRALE"
    assert (salary.amount, salary.counterparty_name) == (Decimal("1800.00"), "ACME SPA")
    # In sospeso senza data contabile né causale: data dell'operazione, descrizione dalla
    # controparte, nessun ID (la pipeline usa l'impronta).
    assert (pending.status, pending.booking_date, pending.external_id) == (
        "pending",
        date(2026, 10, 5),
        None,
    )
    assert pending.description == "AMAZON"


def test_unknown_account_is_refused() -> None:
    with pytest.raises(EnableBankingError, match=r"bank\.account_not_in_consent"):
        _connector().get_balances("altro")


# --- Cifratura e consenso ----------------------------------------------------------------------


def test_encryption_roundtrip_and_tampering() -> None:
    token = crypto.encrypt_json({"a": 1})
    assert b'"a"' not in token
    assert crypto.decrypt_json(token) == {"a": 1}
    with pytest.raises(crypto.DecryptionError):
        crypto.decrypt_json(token[:-4] + b"AAAA")
    assert crypto.key_path().is_file()


@pytest.fixture
def eb(seeded: Session, monkeypatch: pytest.MonkeyPatch) -> tuple[Session, dict[str, Any]]:
    """Credenziali finte e client finto al posto di quello vero."""
    env = setup.credentials_path()
    env.write_text(f"EB_APPLICATION_ID={APP_ID}\nEB_ENV=sandbox\n", encoding="utf-8")
    (env.parent / "enablebanking.pem").write_text(PEM, encoding="utf-8")
    state: dict[str, Any] = {"client": FakeEBClient()}
    monkeypatch.setattr(setup, "make_client", lambda psu_headers=None: state["client"])
    return seeded, state


def test_state_is_encrypted_and_expires(
    eb: tuple[Session, dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    db, state = eb
    url = setup.start_authorization(aspsp_name="Mock ASPSP", country="IT")
    assert url.startswith("https://tilisy-sandbox.enablebanking.com/")
    [auth] = state["client"].authorizations
    assert auth["redirect_url"] == "https://localhost:5173/impostazioni/ritorno-banca"
    assert "Mock ASPSP" not in auth["state"]  # cifrato
    # Validità: al massimo quella della banca (180 giorni).
    until = datetime.fromisoformat(auth["valid_until"])
    assert timedelta(days=179) < until - datetime.now(UTC) <= timedelta(days=180)

    with pytest.raises(setup.AuthorizationError, match=r"bank\.flow_expired"):
        setup.complete_authorization(db, code="c", state="manomesso")
    monkeypatch.setattr(setup, "STATE_TTL_SECONDS", -1)
    with pytest.raises(setup.AuthorizationError, match=r"bank\.flow_expired"):
        setup.complete_authorization(db, code="c", state=auth["state"])
    with pytest.raises(setup.AuthorizationError, match=r"bank\.unavailable"):
        setup.start_authorization(aspsp_name="Altra banca", country="IT")


def test_psu_headers_skip_local_ip() -> None:
    assert setup.psu_headers("127.0.0.1", "UA", "it-IT") == {
        "Psu-User-Agent": "UA",
        "Psu-Accept-language": "it-IT",
    }
    assert setup.psu_headers("8.8.8.8", None, None) == {"Psu-Ip-Address": "8.8.8.8"}


# --- API: consenso completo e sincronizzazione ---------------------------------------------------


def _connect(client: TestClient) -> dict[str, Any]:
    url = client.post("/api/banks/authorize", json={"aspsp_name": "Mock ASPSP"}).json()["url"]
    assert url.startswith("https://")
    return {"url": url}


def test_banks_flow_end_to_end(
    client: TestClient,
    eb: tuple[Session, dict[str, Any]],
    freeze_today: Callable[[date], None],
) -> None:
    freeze_today(DAY)
    db, state = eb
    status = client.get("/api/banks/status").json()
    assert status == {
        "credentials_found": True,
        "environment": "sandbox",
        "redirect_url": "https://localhost:5173/impostazioni/ritorno-banca",
    }
    [bank] = client.get("/api/banks/aspsps", params={"country": "IT"}).json()
    assert (bank["name"], bank["max_consent_days"]) == ("Mock ASPSP", 180)

    _connect(client)
    auth_state = state["client"].authorizations[-1]["state"]
    refused = client.post(
        "/api/banks/callback", json={"state": auth_state, "error": "access_denied"}
    )
    assert refused.status_code == 400
    assert refused.json()["detail"] == {
        "code": "bank.provider_error",
        "params": {"message": "access_denied"},
    }

    done = client.post("/api/banks/callback", json={"state": auth_state, "code": "ok"})
    assert done.status_code == 200, done.text
    body = done.json()
    assert (body["institution"], body["accounts"]) == ("Mock ASPSP", 2)
    assert body["sync"]["status"] == "success", body["sync"]

    source = db.get(AccountSource, body["source_id"])
    assert source is not None
    assert source.provider == Provider.ENABLEBANKING
    assert source.consent_expires_at == datetime(2027, 4, 4, 10, tzinfo=UTC)
    assert source.session_data_encrypted is not None
    assert b"sess-0001" not in source.session_data_encrypted  # cifrata
    accounts = list(db.scalars(select(Account).where(Account.source_id == source.id)))
    assert sorted(a.type for a in accounts) == ["checking", "credit_card"]
    checking = next(a for a in accounts if a.type == "checking")
    amounts = sorted(
        db.scalars(select(Transaction.amount).where(Transaction.account_id == checking.id))
    )
    assert amounts == [Decimal("-30.00"), Decimal("-12.50"), Decimal("1800.00")]
    balances = db.scalar(
        select(func.count()).select_from(Balance).where(Balance.account_id == checking.id)
    )
    assert balances == 2

    # Rinnovo del consenso: stessa sorgente, stessi conti, la sessione vecchia viene revocata.
    renewed = {**SESSION, "session_id": "sess-0002-0000-0000-000000000000"}
    state["client"] = FakeEBClient(session=renewed)
    renew = client.post("/api/banks/authorize", json={"source_id": source.id})
    assert renew.status_code == 200, renew.text
    assert state["client"].authorizations[-1]["aspsp_name"] == "Mock ASPSP"
    assert client.post("/api/banks/authorize", json={}).status_code == 422
    auth_state = state["client"].authorizations[-1]["state"]
    again = client.post("/api/banks/callback", json={"state": auth_state, "code": "ok"}).json()
    assert again["source_id"] == source.id
    assert state["client"].deleted == [SESSION["session_id"]]
    assert (
        db.scalar(select(func.count()).select_from(Account).where(Account.source_id == source.id))
        == 2
    )
    assert (
        db.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.account_id == checking.id)
        )
        == 3
    )

    bad = client.post("/api/banks/callback", json={"state": auth_state, "code": "bad"})
    assert bad.status_code == 409

    # Scollega tenendo i dati: sessione revocata e cancellata, movimenti intatti.
    kept = client.delete(f"/api/banks/sources/{source.id}")
    assert kept.json() == {"deleted_transactions": 0}
    db.refresh(source)
    stored = db.scalar(
        select(AccountSource.session_data_encrypted).where(AccountSource.id == source.id)
    )
    assert (source.status, stored) == ("disabled", None)
    assert "sess-0002-0000-0000-000000000000" in state["client"].deleted
    tx_count = select(func.count()).select_from(Transaction)
    assert db.scalar(tx_count.where(Transaction.account_id == checking.id)) == 3
    # Scollega eliminando i dati.
    gone = client.delete(f"/api/banks/sources/{source.id}", params={"delete_data": True})
    assert gone.json() == {"deleted_transactions": 3}
    assert db.get(AccountSource, source.id) is None
    assert client.delete("/api/banks/sources/999").status_code == 404


def test_expired_consent_marks_source_expired(
    client: TestClient,
    eb: tuple[Session, dict[str, Any]],
    freeze_today: Callable[[date], None],
) -> None:
    freeze_today(DAY)
    db, state = eb
    _connect(client)
    auth_state = state["client"].authorizations[-1]["state"]
    source_id = client.post("/api/banks/callback", json={"state": auth_state, "code": "ok"}).json()[
        "source_id"
    ]
    source = db.get(AccountSource, source_id)
    assert source is not None

    # La banca rifiuta la sessione (revocata): stato "scaduto", non "errore".
    state["client"] = FakeEBClient(expired=True)
    assert run_sync(db, source).status == "error"
    assert source.status == "expired"

    # Consenso oltre la scadenza: non si contatta nemmeno la banca.
    source.status = "active"
    source.consent_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    response = client.post(f"/api/sources/{source_id}/sync")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "bank.consent_expired"
    db.refresh(source)
    assert source.status == "expired"


def test_auto_sync_for_banks_respects_interval_and_skips_expired(
    eb: tuple[Session, dict[str, Any]],
) -> None:
    db, _ = eb
    source = AccountSource(
        provider=Provider.ENABLEBANKING,
        institution="Mock ASPSP",
        display_name="Mock ASPSP",
        session_data_encrypted=crypto.encrypt_json(
            {
                "session_id": SESSION["session_id"],
                "aspsp": SESSION["aspsp"],
                "accounts": [session_account(a) for a in SESSION["accounts"]],
            }
        ),
        consent_expires_at=datetime.now(UTC) + timedelta(days=100),
    )
    db.add(source)
    db.commit()
    clock = {"now": datetime.now(UTC)}
    auto = AutoSync(
        lambda: _nullcontext(db),
        {Provider.ENABLEBANKING: timedelta(hours=12), Provider.TRADING212: timedelta(0)},
        now=lambda: clock["now"],
    )
    assert auto.run_due() == [source.id]
    clock["now"] += timedelta(hours=6)
    assert auto.run_due() == []
    clock["now"] += timedelta(hours=7)
    assert auto.run_due() == [source.id]
    source.status = "expired"
    db.commit()
    clock["now"] += timedelta(hours=13)
    assert auto.run_due() == []


def _nullcontext(db: Session) -> Any:
    from contextlib import nullcontext

    return nullcontext(db)


def test_auto_sync_hours_cannot_exceed_four_per_day(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="4 letture"):
        Settings(data_dir=tmp_path, eb_auto_sync_hours=3)
    assert Settings(data_dir=tmp_path, eb_auto_sync_hours=0).eb_auto_sync_hours == 0
