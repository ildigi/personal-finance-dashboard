"""Trading 212: client solo lettura, traduzione dei dati, sincronizzazione completa.

Nessun test contatta Trading 212: le risposte sono finte (con la stessa forma di quelle vere)
e passano da `httpx.MockTransport` o da un client finto.
"""

from __future__ import annotations

import base64
import inspect
from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ingestion.runner import run_sync
from app.ingestion.trading212_setup import ensure_trading212_source
from app.integrations import registry
from app.integrations.trading212 import client as t212_client
from app.integrations.trading212.client import (
    Credentials,
    Trading212Client,
    Trading212Error,
    load_credentials,
)
from app.integrations.trading212.connector import Trading212Connector
from app.models import (
    Balance,
    Dividend,
    InvestmentCashFlow,
    InvestmentOrder,
    Pie,
    PieInstrument,
    Portfolio,
    Position,
)

KEY = "FAKEKEY123"
SECRET = "FAKESECRET456"  # credenziali finte dei test
CREDS = Credentials(SecretStr(KEY), SecretStr(SECRET), "live")
DAY = date(2026, 10, 5)

# --- Risposte finte, con la forma di quelle vere ------------------------------------------

SUMMARY: dict[str, Any] = {
    "id": 12345678,
    "currency": "EUR",
    "totalValue": 1210.50,
    "cash": {"availableToTrade": 5.25, "reservedForOrders": 0, "inPies": 3.25},
    "investments": {
        "currentValue": 1202.0,
        "totalCost": 1100.0,
        "realizedProfitLoss": 8.0,  # = somma del realizzato delle esecuzioni
        "unrealizedProfitLoss": 102.0,
    },
}


def _instrument(ticker: str, name: str, currency: str = "EUR") -> dict[str, Any]:
    return {"ticker": ticker, "name": name, "isin": f"IE00{ticker[:4]}0000", "currency": currency}


POSITIONS: list[dict[str, Any]] = [
    {
        "instrument": _instrument("VWCEd_EQ", "Vanguard FTSE All-World"),
        "createdAt": "2025-09-01T10:00:00.000+03:00",
        "quantity": 6.5,
        "quantityAvailableForTrading": 0,
        "quantityInPies": 6.5,
        "currentPrice": 140.0,
        "averagePricePaid": 123.0769,
        "walletImpact": {
            "currency": "EUR",
            "totalCost": 800.0,
            "currentValue": 910.0,
            "unrealizedProfitLoss": 110.0,
            "fxImpact": None,
        },
    },
    {
        "instrument": _instrument("AAPL_US_EQ", "Apple", "USD"),
        "createdAt": "2025-10-01T10:00:00.000+03:00",
        "quantity": 1.2,
        "quantityAvailableForTrading": 1.2,
        "quantityInPies": 0,
        "currentPrice": 250.0,
        "averagePricePaid": 240.0,
        "walletImpact": {
            "currency": "EUR",
            "totalCost": 300.0,
            "currentValue": 292.0,
            "unrealizedProfitLoss": -8.0,
            "fxImpact": -3.1,
        },
    },
]


def _order(
    fill_id: int | None,
    side: str,
    filled_at: str,
    quantity: float,
    net: float,
    *,
    ticker: str = "VWCEd_EQ",
    fee: float | None = None,
    realised: float | None = None,
) -> dict[str, Any]:
    order = {
        "id": 1000 + (fill_id or 0),
        "strategy": "VALUE",
        "type": "MARKET",
        "ticker": ticker,
        "status": "FILLED" if fill_id else "CANCELLED",
        "currency": "EUR",
        "side": side,
        "createdAt": filled_at,
        "initiatedFrom": "AUTOINVEST",
        "instrument": _instrument(ticker, "Vanguard FTSE All-World"),
    }
    if fill_id is None:
        return {"order": order}
    taxes = [{"name": "CURRENCY_CONVERSION_FEE", "quantity": -fee}] if fee else []
    wallet: dict[str, Any] = {"currency": "EUR", "netValue": net, "fxRate": 1, "taxes": taxes}
    if realised is not None:
        wallet["realisedProfitLoss"] = realised
    return {
        "order": order,
        "fill": {
            "id": fill_id,
            "quantity": quantity,
            "price": 130.0,
            "type": "TRADE",
            "tradingMethod": "TOTV",
            "filledAt": filled_at,
            "walletImpact": wallet,
        },
    }


ORDERS = [  # dal più recente, come l'API
    _order(3, "SELL", "2026-09-20T09:00:00.000Z", -0.5, 70.0, realised=8.0),
    _order(None, "BUY", "2026-09-10T09:00:00.000Z", 0, 0),
    _order(2, "BUY", "2026-09-05T09:00:00.000Z", 1.0, 130.0, fee=0.15),
    _order(1, "BUY", "2025-09-01T09:00:00.000Z", 6.0, 670.0),
]
DIVIDENDS = [
    {
        "ticker": "VWCEd_EQ",
        "instrument": _instrument("VWCEd_EQ", "Vanguard FTSE All-World"),
        "reference": "div-ref-2",
        "quantity": 6.0,
        "amount": 2.1,
        "currency": "EUR",
        "grossAmountPerShare": 0.35,
        "amountInEuro": 2.1,
        "paidOn": "2026-09-24T22:00:00.000+03:00",
        "type": "DIVIDEND",
    },
    {
        "ticker": "VWCEd_EQ",
        "instrument": _instrument("VWCEd_EQ", "Vanguard FTSE All-World"),
        "reference": "div-ref-1",
        "quantity": 6.0,
        "amount": 1.9,
        "currency": "EUR",
        "grossAmountPerShare": 0.32,
        "amountInEuro": 1.9,
        "paidOn": "2025-12-24T22:00:00.000+03:00",
        "type": "DIVIDEND",
    },
]
TRANSACTIONS = [
    {"type": "INTEREST_ON_FREE_CASH", "amount": 0.4, "currency": "EUR", "reference": "t-4",
     "dateTime": "2026-09-30T23:00:00.000Z"},
    {"type": "WITHDRAW", "amount": -50.0, "currency": "EUR", "reference": "t-3",
     "dateTime": "2026-06-01T08:00:00.000Z"},
    {"type": "DEPOSIT", "amount": 300.0, "currency": "EUR", "reference": "t-2",
     "dateTime": "2026-01-10T08:00:00.000Z"},
    {"type": "DEPOSIT", "amount": 800.0, "currency": "EUR", "reference": "t-1",
     "dateTime": "2025-08-30T08:00:00.000Z"},
]  # fmt: skip
PIES = [
    {
        "id": 77,
        "cash": 3.25,
        "dividendDetails": {"gained": 4.0, "reinvested": 4.0, "inCash": 0},
        "result": {
            "priceAvgInvestedValue": 800.0,
            "priceAvgValue": 910.0,
            "priceAvgResult": 110.0,
            "priceAvgResultCoef": 0.1375,
        },
        "progress": 0.5,
        "status": None,
    }
]
PIE_DETAIL: dict[str, Any] = {
    "instruments": [
        {
            "ticker": "VWCEd_EQ",
            "result": {
                "priceAvgInvestedValue": 800.0,
                "priceAvgValue": 910.0,
                "priceAvgResult": 110.0,
                "priceAvgResultCoef": 0.1375,
            },
            "expectedShare": 1.0,
            "currentShare": 1.0,
            "ownedQuantity": 6.5,
            "issues": [],
        }
    ],
    "settings": {
        "id": 77,
        "name": "ETF",
        "icon": "Home",
        "goal": 10000,
        "creationDate": 1756700000000,
        "dividendCashAction": "REINVEST",
        "instrumentShares": None,
    },
}


class FakeClient:
    """Stessa interfaccia di `Trading212Client`, risposte finte."""

    def __init__(self, **overrides: Any) -> None:
        self.data: dict[str, Any] = {
            "summary": SUMMARY,
            "positions": POSITIONS,
            "orders": ORDERS,
            "dividends": DIVIDENDS,
            "transactions": TRANSACTIONS,
            "pies": PIES,
            "pie": PIE_DETAIL,
            **overrides,
        }
        self.closed = False

    def account_summary(self) -> dict[str, Any]:
        return dict(self.data["summary"])

    def positions(self) -> list[dict[str, Any]]:
        return list(self.data["positions"])

    def pies(self) -> list[dict[str, Any]]:
        return list(self.data["pies"])

    def pie(self, pie_id: int) -> dict[str, Any]:
        return dict(self.data["pie"])

    def history_orders(self) -> Iterator[dict[str, Any]]:
        return iter(self.data["orders"])

    def history_dividends(self) -> Iterator[dict[str, Any]]:
        return iter(self.data["dividends"])

    def history_transactions(self) -> Iterator[dict[str, Any]]:
        return iter(self.data["transactions"])

    def close(self) -> None:
        self.closed = True


def connector(**overrides: Any) -> Trading212Connector:
    return Trading212Connector(FakeClient(**overrides))  # type: ignore[arg-type]


# --- Client: solo lettura ---------------------------------------------------------------------


def _client(
    handler: Callable[[httpx.Request], httpx.Response], sleeps: list[float] | None = None
) -> Trading212Client:
    """Tempo finto: ogni pausa fa avanzare l'orologio, senza aspettare davvero."""
    now = {"t": 0.0}
    recorded = sleeps if sleeps is not None else []

    def sleep(seconds: float) -> None:
        recorded.append(seconds)
        now["t"] += seconds

    return Trading212Client(
        CREDS,
        transport=httpx.MockTransport(handler),
        sleep=sleep,
        clock=lambda: now["t"],
        wall_clock=lambda: 1_000_000.0 + now["t"],
    )


def test_client_has_only_read_methods() -> None:
    public = {
        name
        for name, _ in inspect.getmembers(Trading212Client, predicate=inspect.isfunction)
        if not name.startswith("_")
    }
    assert public == {
        "account_summary",
        "positions",
        "pies",
        "pie",
        "history_orders",
        "history_dividends",
        "history_transactions",
        "close",
    }
    source = inspect.getsource(t212_client)
    for verb in ('"POST"', '"PUT"', '"PATCH"', '"DELETE"', ".post(", ".put(", ".delete("):
        assert verb not in source, verb
    # Nessun endpoint di ordini o di scrittura tra quelli consentiti.
    assert all("order" not in path or "history" in path for path in t212_client.READ_ENDPOINTS)


def test_every_request_is_an_authenticated_get() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("/pies"):
            return httpx.Response(200, json=PIES)
        if "/pies/" in request.url.path:
            return httpx.Response(200, json=PIE_DETAIL)
        if request.url.path.endswith("/positions"):
            return httpx.Response(200, json=POSITIONS)
        if "/history/" in request.url.path:
            return httpx.Response(200, json={"items": [], "nextPagePath": None})
        return httpx.Response(200, json=SUMMARY)

    with _client(handler) as c:
        c.account_summary()
        c.positions()
        c.pies()
        c.pie(77)
        list(c.history_orders())
        list(c.history_dividends())
        list(c.history_transactions())

    expected = "Basic " + base64.b64encode(f"{KEY}:{SECRET}".encode()).decode()
    assert {r.method for r in seen} == {"GET"}
    assert {r.headers["Authorization"] for r in seen} == {expected}
    assert {r.url.host for r in seen} == {"live.trading212.com"}
    assert all(r.url.path.startswith("/api/v0/equity/") for r in seen)


def test_disallowed_paths_are_refused_before_any_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("nessuna richiesta deve partire")

    with _client(handler) as c:
        for path in ("/orders/market", "/orders", "/pies/1/duplicate", "/history/exports"):
            with pytest.raises(Trading212Error, match=r"broker\.endpoint_forbidden"):
                c._get(path)


def test_pagination_follows_next_page_path() -> None:
    pages = {
        None: {
            "items": [{"n": 1}, {"n": 2}],
            "nextPagePath": "/api/v0/equity/history/orders?limit=50&cursor=99",
        },
        "99": {"items": [{"n": 3}], "nextPagePath": None},
    }  # fmt: skip
    seen: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        seen.append(params)
        return httpx.Response(200, json=pages[params.get("cursor")])

    with _client(handler) as c:
        assert [i["n"] for i in c.history_orders()] == [1, 2, 3]
    assert seen == [{"limit": "50"}, {"limit": "50", "cursor": "99"}]


def test_foreign_next_page_path_is_refused() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"items": [], "nextPagePath": "https://evil.example/api/v0/equity/x"}
        )

    with _client(handler) as c, pytest.raises(Trading212Error, match=r"broker\.bad_response"):
        list(c.history_dividends())


def test_rate_limit_waits_until_reset_then_retries() -> None:
    calls = {"n": 0}
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"x-ratelimit-reset": str(1_000_000 + 12)})
        return httpx.Response(200, json=SUMMARY)

    with _client(handler, sleeps) as c:
        assert c.account_summary()["id"] == SUMMARY["id"]
    assert calls["n"] == 2
    assert sleeps == [12.5]  # fino al reset, più mezzo secondo


def test_calls_to_the_same_endpoint_are_spaced() -> None:
    sleeps: list[float] = []
    now = {"t": 0.0}
    client = Trading212Client(
        CREDS,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json=SUMMARY)),
        sleep=sleeps.append,
        clock=lambda: now["t"],
    )
    client.account_summary()
    now["t"] = 1.0
    client.account_summary()
    assert sleeps == [4.0]  # riepilogo: una richiesta ogni 5 secondi


@pytest.mark.parametrize(
    ("status", "message"),
    [
        (401, r"broker\.key_invalid"),
        (403, r"broker\.permission_missing"),
        (404, r"broker\.not_found"),
        (400, r"broker\.http_error"),
    ],
)
def test_errors_are_readable_and_never_contain_the_key(status: int, message: str) -> None:
    with (
        _client(lambda r: httpx.Response(status, json={"detail": KEY})) as c,
        pytest.raises(Trading212Error, match=message) as excinfo,
    ):
        c.account_summary()
    assert KEY not in str(excinfo.value)
    assert SECRET not in str(excinfo.value)
    assert SECRET not in repr(CREDS)


def test_load_credentials(tmp_path: Path) -> None:
    path = tmp_path / "trading212.env"
    with pytest.raises(Trading212Error, match=r"broker\.credentials_missing"):
        load_credentials(path)
    path.write_text("T212_API_KEY=abc\n", encoding="utf-8")
    with pytest.raises(Trading212Error, match=r"broker\.credentials_invalid"):
        load_credentials(path)
    path.write_text("T212_API_KEY=abc\nT212_API_SECRET=def\nT212_ENV=prod\n", encoding="utf-8")
    with pytest.raises(Trading212Error, match="T212_ENV"):
        load_credentials(path)
    path.write_text("T212_API_KEY= abc \nT212_API_SECRET=def\n", encoding="utf-8")
    creds = load_credentials(path)
    assert creds.api_key.get_secret_value() == "abc"
    assert creds.environment == "live"


# --- Connettore: traduzione dei dati -----------------------------------------------------------


def test_connector_surface_is_read_only() -> None:
    public = {
        name
        for name, _ in inspect.getmembers(Trading212Connector, predicate=inspect.isfunction)
        if not name.startswith("_")
    }
    assert all(name.startswith("get_") or name == "close" for name in public), public


def test_cash_and_positions() -> None:
    c = connector()
    assert c.get_account().external_id == "12345678"
    cash = c.get_cash()
    assert cash.free == Decimal("8.50")  # disponibile + nelle Pie + riservata
    assert cash.total == Decimal("1210.50")
    assert cash.invested == Decimal("1100.00")
    [vwce, aapl] = c.get_positions()
    assert (vwce.cost_basis_eur, vwce.market_value_eur) == (Decimal("800.00"), Decimal("910.00"))
    assert vwce.fx_rate == 1
    assert vwce.quantity_in_pies == Decimal("6.5")
    # USD: costo ai cambi storici dal broker, cambio attuale ricavato dal valore.
    assert aapl.cost_basis_eur == Decimal("300.00")
    assert aapl.fx_rate == Decimal("0.9733333333")


def test_non_eur_account_is_refused() -> None:
    with pytest.raises(Trading212Error, match=r"broker\.not_eur"):
        connector(summary={**SUMMARY, "currency": "GBP"}).get_cash()


def test_orders_dividends_and_cash_flows() -> None:
    c = connector()
    orders = c.get_orders(date(2000, 1, 1))
    assert [o.external_id for o in orders] == ["3", "2", "1"]  # l'annullato non c'è
    sell = orders[0]
    assert (sell.side, sell.quantity, sell.value_eur) == ("sell", Decimal("0.5"), Decimal("70.00"))
    assert orders[1].fees_eur == Decimal("0.15")
    assert sell.executed_at == datetime(2026, 9, 20, 9, tzinfo=UTC)
    # Lo storico arriva dal più recente: ci si ferma al primo più vecchio di `since`.
    assert [o.external_id for o in c.get_orders(date(2026, 9, 1))] == ["3", "2"]

    dividends = c.get_dividends(date(2000, 1, 1))
    assert [(d.external_id, d.paid_on) for d in dividends] == [
        ("div-ref-2", date(2026, 9, 24)),  # orario italiano, non UTC
        ("div-ref-1", date(2025, 12, 24)),
    ]
    flows = c.get_cash_flows(date(2000, 1, 1))
    assert [(f.type, f.amount) for f in flows] == [
        ("interest", Decimal("0.40")),
        ("withdrawal", Decimal("50.00")),
        ("deposit", Decimal("300.00")),
        ("deposit", Decimal("800.00")),
    ]


def test_pies() -> None:
    [pie] = connector().get_pies()
    assert (pie.external_id, pie.name, pie.dividend_action) == ("77", "ETF", "REINVEST")
    assert (pie.cash_eur, pie.invested_eur, pie.result_eur) == (
        Decimal("3.25"),
        Decimal("800.00"),
        Decimal("110.00"),
    )
    [instrument] = pie.instruments
    assert (instrument.ticker, instrument.expected_share) == ("VWCEd_EQ", Decimal("1.0"))


# --- Sincronizzazione completa e API ----------------------------------------------------------


@pytest.fixture
def t212_db(
    seeded: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> tuple[Session, dict[str, Any]]:
    secrets = tmp_path / "trading212.env"
    secrets.write_text(f"T212_API_KEY={KEY}\nT212_API_SECRET={SECRET}\n", encoding="utf-8")
    monkeypatch.setattr(registry, "trading212_credentials_path", lambda: secrets)
    from app.ingestion import trading212_setup

    monkeypatch.setattr(trading212_setup, "trading212_credentials_path", lambda: secrets)
    state: dict[str, Any] = {"client": FakeClient()}
    monkeypatch.setattr(registry, "Trading212Client", lambda creds, **_: state["client"])
    return seeded, state


def test_full_sync_is_idempotent_and_keeps_pies_current(
    t212_db: tuple[Session, dict[str, Any]],
) -> None:
    db, state = t212_db
    source = ensure_trading212_source(db)
    db.commit()
    first = run_sync(db, source, today=DAY)
    assert first.status == "success", first.jobs
    assert state["client"].closed

    def count(model: Any) -> int:
        return db.scalar(select(func.count()).select_from(model)) or 0

    assert (count(InvestmentOrder), count(Dividend), count(InvestmentCashFlow)) == (3, 2, 4)
    assert (count(Pie), count(PieInstrument), count(Position)) == (1, 1, 2)
    portfolio = db.scalar(select(Portfolio))
    assert portfolio is not None
    balance = db.scalar(select(Balance).where(Balance.account_id == portfolio.account_id))
    assert balance is not None
    assert balance.balance == Decimal("1210.50")

    # Seconda sync: niente doppioni; la Pie cambia composizione.
    detail = {
        **PIE_DETAIL,
        "instruments": [
            {**PIE_DETAIL["instruments"][0], "expectedShare": 0.6},
            {**PIE_DETAIL["instruments"][0], "ticker": "EIMId_EQ", "expectedShare": 0.4},
        ],
    }
    state["client"] = FakeClient(pie=detail)
    assert run_sync(db, source, today=DAY).status == "success"
    assert (count(InvestmentOrder), count(Dividend), count(InvestmentCashFlow)) == (3, 2, 4)
    assert count(PieInstrument) == 2
    state["client"] = FakeClient(pies=[])
    assert run_sync(db, source, today=DAY).status == "success"
    assert count(Pie) == 0


def test_investments_api(
    client: TestClient,
    t212_db: tuple[Session, dict[str, Any]],
    freeze_today: Callable[[date], None],
) -> None:
    freeze_today(DAY)
    status = client.get("/api/sources/trading212/status").json()
    assert status == {"credentials_found": True, "source_id": None}
    connected = client.post("/api/sources/trading212")
    assert connected.status_code == 200, connected.text
    assert connected.json()["status"] == "success"
    assert client.get("/api/sources/trading212/status").json()["source_id"] is not None

    [portfolio] = client.get("/api/investments/portfolios").json()
    assert portfolio["is_mock"] is False
    summary = client.get(f"/api/investments/{portfolio['id']}/summary").json()
    assert summary["value_eur"] == "1210.50"  # 910 + 292 + 8,50 di liquidità
    assert summary["net_deposited_eur"] == "1050.00"  # 800 + 300 − 50
    returns = summary["returns"]
    assert returns["total_pl_eur"] == "160.50"
    assert returns["simple_pct"] == pytest.approx(15.29)
    assert returns["days"] == 401
    # Più di un anno di storia, capitale rimasto investito: l'XIRR annuo è affidabile.
    assert returns["mwr_annual_pct"] is not None
    assert Decimal(returns["average_invested_eur"]) == Decimal("984.79")
    breakdown = summary["breakdown"]
    assert breakdown["realized_eur"] == "8.00"  # dalle esecuzioni del broker
    assert breakdown["unrealized_eur"] == "102.00"
    assert breakdown["dividends_eur"] == "4.00"
    assert breakdown["interest_eur"] == "0.40"
    assert breakdown["fees_eur"] == "0.15"
    parts = sum(
        Decimal(breakdown[k])
        for k in ("unrealized_eur", "realized_eur", "dividends_eur", "interest_eur", "other_eur")
    ) - Decimal(breakdown["fees_eur"])
    assert parts == Decimal(returns["total_pl_eur"])
    [vwce, aapl] = summary["positions"]
    assert (vwce["ticker"], vwce["pie_name"], aapl["pie_name"]) == ("VWCEd_EQ", "ETF", None)
    assert vwce["weight_pct"] + aapl["weight_pct"] == pytest.approx(100)
    [pie] = summary["pies"]
    # Come nell'app: la liquidità della Pie (3,25) è nella base investita e nel valore.
    assert (pie["invested_eur"], pie["value_eur"]) == ("803.25", "913.25")
    assert pie["result_pct"] == pytest.approx(13.69)
    assert pie["instruments"][0]["name"] == "Vanguard FTSE All-World"

    activity = client.get(f"/api/investments/{portfolio['id']}/activity").json()
    assert [o["side"] for o in activity["orders"]] == ["sell", "buy", "buy"]
    months = {m["month"]: m for m in activity["months"]}
    assert months["2025-08"]["net_deposited_eur"] == "800.00"
    assert months["2026-06"]["net_deposited_eur"] == "1050.00"
    assert months["2026-10"]["value_eur"] is not None  # istantanea della sync
    assert client.get("/api/investments/999/summary").status_code == 404


def test_connect_without_credentials(
    client: TestClient, seeded: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from app.ingestion import trading212_setup

    missing = tmp_path / "nope.env"
    monkeypatch.setattr(trading212_setup, "trading212_credentials_path", lambda: missing)
    assert client.get("/api/sources/trading212/status").json()["credentials_found"] is False
    response = client.post("/api/sources/trading212")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "broker.credentials_missing"
