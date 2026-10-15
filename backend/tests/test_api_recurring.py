"""Ricorrenze nel database e API: proposte dai dati mock, conferma, rifiuto, fine, addebiti."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.classification.engine import classify_all
from app.ingestion.mock_setup import ensure_mock_sources
from app.ingestion.runner import run_sync
from app.models import Account, RecurringTransaction, Transaction
from app.models.enums import RecurringStatus
from tests.conftest import make_synced_transaction

DAY = date(2026, 9, 15)

# Le serie dello scenario mock (SPEC §16, Fase 6): tutte mensili, nessun'altra.
EXPECTED_MOCK_SERIES = {
    ("Rossi Maria", "out", "520.00"),  # affitto
    ("Trading 212", "out", "200.00"),  # versamento mensile del giorno 5
    ("Virgin Active", "out", "29.90"),
    ("ATM Milano", "out", "22.00"),
    ("OpenAI", "out", "18.64"),  # 20 $ al cambio del giorno (mediana degli ultimi tre)
    ("Apple · Musica", "out", "10.99"),
    ("Iliad", "out", "9.99"),
    ("Netflix", "out", "6.99"),
    ("Canone mensile conto", "out", "2.00"),
    ("Apple · Cloud e archiviazione", "out", "0.99"),
    ("Acme", "in", "1500.00"),  # stipendio (mediana degli ultimi tre)
}


@pytest.fixture
def mock_db(seeded: Session, freeze_today: Callable[[date], None]) -> Session:
    freeze_today(DAY)
    for source in ensure_mock_sources(seeded):
        assert run_sync(seeded, source, today=DAY).status == "success"
    seeded.commit()
    return seeded


def _by_name(client: TestClient) -> dict[str, dict[str, Any]]:
    return {item["name"]: item for item in client.get("/api/recurring").json()["items"]}


def _linked(db: Session, recurring_id: int) -> int:
    return (
        db.scalar(
            select(func.count(Transaction.id)).where(Transaction.recurring_id == recurring_id)
        )
        or 0
    )


# --- Dati mock --------------------------------------------------------------------------------


def test_mock_subscriptions_are_suggested_with_the_right_frequency(
    client: TestClient, mock_db: Session
) -> None:
    items = client.get("/api/recurring").json()["items"]
    found = {(i["name"], i["direction"], i["expected_amount"]) for i in items}
    assert found == EXPECTED_MOCK_SERIES
    assert {i["status"] for i in items} == {"suggested"}
    assert {i["frequency"] for i in items} == {"monthly"}

    netflix = next(i for i in items if i["name"] == "Netflix")
    netflix_txs = mock_db.scalar(
        select(func.count(Transaction.id)).where(Transaction.description_raw == "Netflix.com")
    )
    assert netflix["occurrences"] == netflix_txs
    assert netflix["next_expected_date"] == "2026-09-22"
    assert netflix["confidence"] > 0.9


def test_confirmed_choices_survive_a_new_sync(client: TestClient, mock_db: Session) -> None:
    netflix = _by_name(client)["Netflix"]
    response = client.patch(
        f"/api/recurring/{netflix['id']}",
        json={"name": "Netflix Standard", "expected_amount": "7.20"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "confirmed"  # correggere una proposta la conferma
    linked = _linked(mock_db, int(str(netflix["id"])))

    for source in ensure_mock_sources(mock_db):
        assert run_sync(mock_db, source, today=DAY).status == "success"
    mock_db.commit()

    after = _by_name(client)["Netflix Standard"]
    assert after["status"] == "confirmed"
    assert after["expected_amount"] == "7.20"
    assert after["occurrences"] == linked
    assert "Netflix" not in _by_name(client)  # nessuna proposta doppia


def test_rejected_is_remembered_and_delete_brings_it_back(
    client: TestClient, mock_db: Session
) -> None:
    iliad = _by_name(client)["Iliad"]
    rejected = client.patch(f"/api/recurring/{iliad['id']}", json={"status": "rejected"})
    assert rejected.json()["occurrences"] == 0

    classify_all(mock_db, today=DAY)
    mock_db.commit()
    assert _by_name(client)["Iliad"]["status"] == "rejected"

    assert client.delete(f"/api/recurring/{iliad['id']}").status_code == 204
    restored = _by_name(client)["Iliad"]
    assert restored["status"] == "suggested"
    assert restored["occurrences"] > 10


def test_patch_validation(client: TestClient, mock_db: Session) -> None:
    item_id = _by_name(client)["Iliad"]["id"]
    for body in (
        {"status": "suggested"},
        {"frequency": "custom"},
        {"expected_amount": 9.99},
        {"expected_amount": "0"},
    ):
        assert client.patch(f"/api/recurring/{item_id}", json=body).status_code == 422, body
    custom = client.patch(
        f"/api/recurring/{item_id}", json={"frequency": "custom", "interval_days": 28}
    )
    assert custom.json()["frequency"] == "custom"
    assert custom.json()["interval_days"] == 28
    assert client.patch("/api/recurring/999999", json={"status": "ended"}).status_code == 404


def test_transactions_can_be_filtered_by_recurring(client: TestClient, mock_db: Session) -> None:
    rent = _by_name(client)["Rossi Maria"]
    page = client.get("/api/transactions", params={"recurring_id": rent["id"]}).json()
    assert page["total"] == rent["occurrences"]
    assert {Decimal(t["amount_eur"]) for t in page["items"]} == {Decimal("-520.00")}


def test_expenses_use_confirmed_subscriptions(client: TestClient, mock_db: Session) -> None:
    params = {"date_from": "2026-09-01", "date_to": "2026-09-30"}
    before = client.get("/api/analytics/expenses", params=params).json()
    assert before["subscriptions_source"] == "average"

    items = _by_name(client)
    for name in ("Netflix", "Apple · Cloud e archiviazione"):
        client.patch(f"/api/recurring/{items[name]['id']}", json={"status": "confirmed"})
    client.patch(f"/api/recurring/{items['Rossi Maria']['id']}", json={"status": "confirmed"})

    after = client.get("/api/analytics/expenses", params=params).json()
    assert after["subscriptions_source"] == "recurring"
    assert after["subscriptions_monthly_eur"] == "7.98"  # l'affitto non è un abbonamento

    summary = client.get("/api/recurring").json()["summary"]
    assert summary["subscriptions_monthly_eur"] == "7.98"
    assert summary["expenses_monthly_eur"] == "527.98"
    assert summary["confirmed_count"] == 3
    assert summary["suggested_count"] == len(EXPECTED_MOCK_SERIES) - 3


# --- Casi costruiti a mano -----------------------------------------------------------------------


def _monthly(db: Session, account: Account, months: list[int]) -> None:
    for month in months:
        make_synced_transaction(
            db,
            account,
            amount="-35.00",
            description="ADDEBITO SEPA PALESTRA ZETA",
            booking_date=date(2026, month, 3),
        )


def test_suggestion_disappears_when_the_series_breaks(
    seeded: Session, account: Account, freeze_today: Callable[[date], None]
) -> None:
    freeze_today(date(2026, 6, 10))
    _monthly(seeded, account, [2, 3, 4, 5, 6])
    classify_all(seeded, today=date(2026, 6, 10))
    [row] = seeded.scalars(select(RecurringTransaction)).all()
    assert row.status == RecurringStatus.SUGGESTED
    assert row.next_expected_date == date(2026, 7, 3)

    # Tre mesi dopo l'ultimo addebito la serie non è più in corso: la proposta sparisce.
    classify_all(seeded, today=date(2026, 9, 20))
    assert seeded.scalars(select(RecurringTransaction)).all() == []


def test_confirmed_becomes_late_and_ended_is_frozen(
    client: TestClient, seeded: Session, account: Account, freeze_today: Callable[[date], None]
) -> None:
    freeze_today(date(2026, 6, 10))
    _monthly(seeded, account, [2, 3, 4, 5, 6])
    classify_all(seeded, today=date(2026, 6, 10))
    seeded.commit()
    [row] = client.get("/api/recurring").json()["items"]
    client.patch(f"/api/recurring/{row['id']}", json={"status": "confirmed"})

    freeze_today(date(2026, 7, 20))  # il 3 luglio non è arrivato nulla
    confirmed = client.get("/api/recurring").json()
    assert confirmed["items"][0]["is_late"] is True
    assert confirmed["summary"]["late_count"] == 1

    ended = client.patch(f"/api/recurring/{row['id']}", json={"status": "ended"}).json()
    assert ended["occurrences"] == 5
    assert ended["is_late"] is False

    # Riprende a ottobre: la ricorrenza terminata resta com'era, ne nasce una nuova proposta.
    freeze_today(date(2026, 12, 10))
    _monthly(seeded, account, [10, 11, 12])
    classify_all(seeded, today=date(2026, 12, 10))
    seeded.commit()
    items = {i["status"]: i for i in client.get("/api/recurring").json()["items"]}
    assert items["ended"]["occurrences"] == 5
    assert items["ended"]["last_seen_date"] == "2026-06-03"
    assert items["suggested"]["occurrences"] == 3


def test_upcoming_charges(
    client: TestClient, seeded: Session, account: Account, freeze_today: Callable[[date], None]
) -> None:
    today = date(2026, 6, 10)
    freeze_today(today)
    _monthly(seeded, account, [2, 3, 4, 5, 6])
    for week in range(5):
        make_synced_transaction(
            seeded,
            account,
            amount="-4.00",
            description="LAVANDERIA SELF SERVICE",
            booking_date=date(2026, 5, 6) + timedelta(weeks=week),
        )
    classify_all(seeded, today=today)
    seeded.commit()

    assert client.get("/api/recurring/upcoming").json() == []  # solo le confermate
    suggested = client.get("/api/recurring/upcoming", params={"include_suggested": True}).json()
    assert {u["status"] for u in suggested} == {"suggested"}

    items = {i["name"]: i for i in client.get("/api/recurring").json()["items"]}
    gym = next(i for name, i in items.items() if "zeta" in name.lower())
    laundry = next(i for name, i in items.items() if "lavanderia" in name.lower())
    for item in (gym, laundry):
        client.patch(f"/api/recurring/{item['id']}", json={"status": "confirmed"})
    assert laundry["frequency"] == "weekly"

    upcoming = client.get("/api/recurring/upcoming", params={"days": 30}).json()
    dates = [(u["name"], u["date"], u["overdue"]) for u in upcoming]
    # La lavanderia del 10 giugno (oggi) non è ancora passata; le settimanali si ripetono.
    assert [d for n, d, _ in dates if n == laundry["name"]] == [
        "2026-06-10", "2026-06-17", "2026-06-24", "2026-07-01", "2026-07-08",
    ]  # fmt: skip
    assert (gym["name"], "2026-07-03", False) in dates
    assert all(Decimal(u["amount_eur"]) < 0 for u in upcoming)
    assert client.get("/api/recurring/upcoming", params={"direction": "in"}).json() == []

    freeze_today(date(2026, 6, 11))  # il giorno dopo la lavanderia è "in ritardo"
    late = client.get("/api/recurring/upcoming", params={"days": 3}).json()
    assert [(u["date"], u["overdue"]) for u in late] == [("2026-06-10", True)]
