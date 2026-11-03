from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion import runner
from app.ingestion.mock_setup import ensure_mock_sources
from app.models import Account, AccountSource, Balance, NetWorthSnapshot


@pytest.fixture(autouse=True)
def fixed_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "today_rome", lambda: date(2026, 9, 15))


def test_sync_endpoint_returns_summary_and_logs(client: TestClient, db: Session) -> None:
    source = next(s for s in ensure_mock_sources(db) if s.credentials_ref == "mock:revolut")
    db.commit()

    response = client.post(f"/api/sources/{source.id}/sync")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "success"
    jobs = {j["job"]: j for j in body["jobs"]}
    assert set(jobs) == {"accounts", "balances", "transactions", "classification"}
    assert jobs["transactions"]["created"] > 300

    logs = client.get("/api/sync-logs", params={"source_id": source.id}).json()
    assert {log["job"] for log in logs} == {
        "accounts",
        "balances",
        "transactions",
        "classification",
    }
    assert all(log["status"] == "success" for log in logs)

    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 1
    assert accounts[0]["balance"] is not None
    assert accounts[0]["balance_as_of"] == "2026-09-15"

    source_body = client.get(f"/api/sources/{source.id}").json()
    assert source_body["last_sync_at"] is not None

    # Ogni sincronizzazione salva la foto del patrimonio del giorno.
    snap = db.scalar(select(NetWorthSnapshot))
    assert snap is not None
    assert snap.snapshot_date == date(2026, 9, 15)
    assert snap.net_worth_eur == Decimal(accounts[0]["balance"])


def test_manual_and_future_sources_cannot_sync(client: TestClient, db: Session) -> None:
    manual = AccountSource(provider="manual", institution="CA", display_name="Manuale")
    t212 = AccountSource(provider="trading212", institution="Trading 212", display_name="T212")
    bank = AccountSource(provider="enablebanking", institution="CA", display_name="CA")
    db.add_all([manual, t212, bank])
    db.commit()
    assert client.post(f"/api/sources/{manual.id}/sync").status_code == 409
    # Trading 212 senza il file delle credenziali (nei test non c'è mai).
    response = client.post(f"/api/sources/{t212.id}/sync")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "broker.credentials_missing"
    response = client.post(f"/api/sources/{bank.id}/sync")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "bank.not_authorized"  # consenso mai dato


def test_mock_setup_endpoint(client: TestClient) -> None:
    response = client.post("/api/mock/setup")
    assert response.status_code == 200
    summaries = response.json()
    assert len(summaries) == 3
    assert all(s["status"] == "success" for s in summaries)
    # Ripeterlo non duplica nulla.
    again = client.post("/api/mock/setup").json()
    created = sum(j["created"] for s in again for j in s["jobs"] if j["job"] == "transactions")
    assert created == 0


def test_account_balance_prefers_available(client: TestClient, db: Session) -> None:
    source = AccountSource(provider="enablebanking", institution="Revolut", display_name="Revolut")
    db.add(source)
    db.flush()
    only_available, both = (
        Account(
            source_id=source.id,
            external_id=ext,
            name=ext,
            type="checking",
            currency="EUR",
            institution="Revolut",
        )
        for ext in ("solo-disponibile", "entrambi")
    )
    db.add_all([only_available, both])
    db.flush()

    def balance(account: Account, kind: str, day: int, amount: str) -> Balance:
        return Balance(
            account_id=account.id,
            as_of=date(2026, 10, day),
            balance=Decimal(amount),
            currency="EUR",
            balance_type=kind,
            source="enablebanking",
        )

    db.add_all(
        [
            # Revolut: solo il saldo disponibile (ITAV).
            balance(only_available, "available", 5, "120.50"),
            # Con entrambi vince il disponibile (comprende i pagamenti in sospeso).
            balance(both, "booked", 5, "80.00"),
            balance(both, "available", 4, "75.00"),
        ]
    )
    db.commit()

    by_name = {a["name"]: a for a in client.get("/api/accounts").json()}
    assert (
        by_name["solo-disponibile"]["balance"],
        by_name["solo-disponibile"]["balance_as_of"],
    ) == (
        "120.50",
        "2026-10-05",
    )
    assert (by_name["entrambi"]["balance"], by_name["entrambi"]["balance_as_of"]) == (
        "75.00",
        "2026-10-04",
    )
    assert by_name["entrambi"]["balance_type"] == "available"
