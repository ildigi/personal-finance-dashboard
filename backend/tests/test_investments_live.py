"""Investimenti: data di inizio, "solo attivi", aggiornamento leggero, istantanee,
sincronizzazione automatica. Il broker è sempre finto (vedi `test_trading212`)."""

from __future__ import annotations

import threading
from collections.abc import Callable
from contextlib import nullcontext
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ingestion import live
from app.ingestion.broker import ensure_portfolio, snapshot_portfolio
from app.ingestion.locks import source_lock
from app.ingestion.scheduler import AutoSync
from app.ingestion.trading212_setup import ensure_trading212_source
from app.integrations.trading212.client import Pacer, Trading212Client
from app.models import AccountSource, Portfolio, PortfolioCashSnapshot, Position
from app.models.enums import Provider
from tests.test_trading212 import (
    CREDS,
    DAY,
    SUMMARY,
    FakeClient,
    connector,
    t212_db,
)


def _connect(client: TestClient) -> int:
    assert client.post("/api/sources/trading212").json()["status"] == "success"
    [portfolio] = client.get("/api/investments/portfolios").json()
    return int(portfolio["id"])


def test_tracking_start_ignores_history_before_it(
    client: TestClient,
    t212_db: tuple[Session, dict[str, Any]],
    freeze_today: Callable[[date], None],
) -> None:
    freeze_today(DAY)
    pid = _connect(client)
    response = client.patch(f"/api/investments/{pid}", json={"tracking_start": "2026-08-17"})
    assert response.status_code == 200, response.text
    assert response.json()["tracking_start"] == "2026-08-17"

    s = client.get(f"/api/investments/{pid}/summary").json()
    # Saldo alla data di inizio dallo storico: 800 + 300 − 50 versati, + 1,90 di dividendo,
    # − 670 di acquisto = 381,90 di liquidità, + 670 di costo della posizione ancora aperta.
    assert s["opening_balance_eur"] == "1051.90"
    assert (s["deposits_eur"], s["withdrawals_eur"]) == ("0.00", "0.00")
    assert s["net_deposited_eur"] == "1051.90"
    assert s["returns"]["total_pl_eur"] == "158.60"  # 1210,50 − 1051,90
    assert s["returns"]["days"] == 49
    assert s["returns"]["mwr_annual_pct"] is None  # meno di un anno: mai annualizzato
    b = s["breakdown"]
    assert b["realized_eur"] == "8.00"  # la vendita del 20 settembre
    assert b["dividends_eur"] == "2.10"  # solo quello di settembre
    assert b["fees_eur"] == "0.15"
    assert s["dividends_12m_eur"] == "2.10"
    parts = sum(
        Decimal(b[k])
        for k in ("unrealized_eur", "realized_eur", "dividends_eur", "interest_eur", "other_eur")
    ) - Decimal(b["fees_eur"])
    assert parts == Decimal(s["returns"]["total_pl_eur"])
    # Solo attivi: le posizioni in mano, come la Pie nell'app: la liquidità della Pie non
    # ancora investita (3,25) sta nel costo e nel valore, il guadagno non cambia.
    assert s["active"] == {
        "value_eur": "1205.25",
        "cost_eur": "1103.25",
        "pl_eur": "102.00",
        "pct": pytest.approx(9.25),
    }

    activity = client.get(f"/api/investments/{pid}/activity").json()
    assert [o["side"] for o in activity["orders"]] == ["sell", "buy"]
    assert [d["paid_on"] for d in activity["dividends"]] == ["2026-09-24"]
    assert [f["type"] for f in activity["cash_flows"]] == ["interest"]
    assert activity["months"][0]["month"] == "2026-08"
    assert activity["months"][0]["net_deposited_eur"] == "1051.90"

    # Senza data di inizio si torna a tutto lo storico.
    client.patch(f"/api/investments/{pid}", json={"tracking_start": None})
    s = client.get(f"/api/investments/{pid}/summary").json()
    assert (s["opening_balance_eur"], s["net_deposited_eur"]) == ("0.00", "1050.00")


def test_tracking_start_validation(
    client: TestClient,
    t212_db: tuple[Session, dict[str, Any]],
    freeze_today: Callable[[date], None],
) -> None:
    freeze_today(DAY)
    pid = _connect(client)
    future = client.patch(f"/api/investments/{pid}", json={"tracking_start": "2026-10-06"})
    assert future.status_code == 422
    assert client.patch(f"/api/investments/{pid}", json={"nope": 1}).status_code == 422
    assert client.patch("/api/investments/999", json={"tracking_start": None}).status_code == 404


def test_live_refresh_is_throttled_and_skips_during_sync(
    client: TestClient,
    t212_db: tuple[Session, dict[str, Any]],
    freeze_today: Callable[[date], None],
) -> None:
    freeze_today(DAY)
    db, state = t212_db
    pid = _connect(client)
    live.reset_throttle()
    state["client"] = FakeClient(summary={**SUMMARY, "totalValue": 1300.0})
    first = client.post(f"/api/investments/{pid}/live").json()
    assert first["refreshed"] is True, first
    assert first["as_of"] is not None
    # Subito dopo: niente nuova chiamata al broker, nessun errore.
    again = client.post(f"/api/investments/{pid}/live").json()
    assert (again["refreshed"], again["message_code"]) == (False, None)

    live.reset_throttle()
    portfolio = db.get(Portfolio, pid)
    assert portfolio is not None
    source_id = db.scalar(select(AccountSource.id).where(AccountSource.provider == "trading212"))
    assert source_id is not None
    lock = source_lock(source_id)
    lock.acquire()
    try:
        busy = client.post(f"/api/investments/{pid}/live").json()
    finally:
        lock.release()
    assert (busy["refreshed"], busy["message_code"]) == (False, "live.sync_running")


def test_live_refresh_reports_broker_errors(
    client: TestClient,
    t212_db: tuple[Session, dict[str, Any]],
    freeze_today: Callable[[date], None],
) -> None:
    freeze_today(DAY)
    _, state = t212_db
    pid = _connect(client)
    live.reset_throttle()
    state["client"] = FakeClient(summary={**SUMMARY, "currency": "GBP"})
    result = client.post(f"/api/investments/{pid}/live").json()
    assert result["refreshed"] is False
    assert result["message_code"] == "broker.not_eur"
    assert client.get(f"/api/investments/{pid}/summary").status_code == 200


def test_one_snapshot_per_quarter_hour(seeded: Session) -> None:
    source = AccountSource(provider="trading212", institution="Trading 212", display_name="T212")
    seeded.add(source)
    seeded.flush()
    portfolio, _ = ensure_portfolio(seeded, source, connector())

    def take(hour: int, minute: int) -> None:
        at = datetime(2026, 10, 5, hour, minute, tzinfo=UTC)
        snapshot_portfolio(seeded, portfolio, connector(), snapshot_at=at, today=DAY)

    def stored() -> list[datetime]:
        return list(
            seeded.scalars(
                select(PortfolioCashSnapshot.snapshot_at).order_by(
                    PortfolioCashSnapshot.snapshot_at
                )
            )
        )

    take(10, 1)
    take(10, 14)  # stesso quarto d'ora: sostituisce
    assert [t.minute for t in stored()] == [14]
    take(10, 16)  # quarto d'ora nuovo
    take(10, 5)  # più vecchia dell'ultima: ignorata
    assert [t.minute for t in stored()] == [14, 16]
    positions = seeded.scalar(select(func.count()).select_from(Position))
    assert positions == 4  # 2 titoli × 2 istantanee


def test_shared_pacer_spaces_calls_across_clients() -> None:
    now = {"t": 0.0}
    sleeps: list[float] = []

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        now["t"] += seconds

    pacer = Pacer(lambda: now["t"])
    clients = [
        Trading212Client(
            CREDS,
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json=SUMMARY)),
            sleep=sleep,
            clock=lambda: now["t"],
            pacer=pacer,
        )
        for _ in range(2)
    ]
    clients[0].account_summary()
    clients[1].account_summary()
    assert sleeps == [5.0]  # il secondo client rispetta il turno del primo


def test_pacer_is_thread_safe() -> None:
    pacer = Pacer(lambda: 0.0)
    waits: list[float] = []
    threads = [
        threading.Thread(target=lambda: waits.append(pacer.wait_time("/positions")))
        for _ in range(5)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(waits) == [0.0, 1.0, 2.0, 3.0, 4.0]


def test_auto_sync_runs_only_when_due(t212_db: tuple[Session, dict[str, Any]]) -> None:
    db, _ = t212_db
    source = ensure_trading212_source(db)
    db.commit()
    clock = {"now": datetime.now(UTC)}
    auto = AutoSync(
        lambda: nullcontext(db),
        {Provider.TRADING212: timedelta(minutes=10)},
        now=lambda: clock["now"],
    )

    assert auto.run_due() == [source.id]  # mai sincronizzata
    assert auto.run_due() == []  # appena fatto
    clock["now"] += timedelta(minutes=11)
    assert auto.run_due() == [source.id]

    source.status = "disabled"
    db.commit()
    clock["now"] += timedelta(minutes=11)
    assert auto.run_due() == []


def test_auto_sync_does_not_retry_errors_every_minute(
    t212_db: tuple[Session, dict[str, Any]],
) -> None:
    db, state = t212_db
    source = ensure_trading212_source(db)
    db.commit()
    state["client"] = FakeClient(summary={**SUMMARY, "currency": "GBP"})
    clock = {"now": datetime.now(UTC)}
    auto = AutoSync(
        lambda: nullcontext(db),
        {Provider.TRADING212: timedelta(minutes=10)},
        now=lambda: clock["now"],
    )
    assert auto.run_due() == [source.id]
    assert db.get(AccountSource, source.id).status == "error"  # type: ignore[union-attr]
    clock["now"] += timedelta(minutes=1)
    assert auto.run_due() == []  # niente nuovo tentativo prima dell'intervallo
