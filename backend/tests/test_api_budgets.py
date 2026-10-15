"""Budget: speso contro budget, soglie di avviso, proiezione, versioni, storico."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Budget, Category, RecurringTransaction, Subcategory
from app.services.budgets import _Cell, _project
from tests.conftest import make_synced_transaction

TODAY = date(2026, 9, 10)


@pytest.fixture
def today(freeze_today: Callable[[date], None]) -> date:
    freeze_today(TODAY)
    return TODAY


def _category(db: Session, code: str) -> Category:
    category = db.scalar(select(Category).where(Category.code == code))
    assert category is not None
    return category


def _sub(db: Session, category: Category, code: str) -> Subcategory:
    sub = db.scalar(
        select(Subcategory).where(Subcategory.category_id == category.id, Subcategory.code == code)
    )
    assert sub is not None
    return sub


def _spend(
    db: Session, account: Account, category: Category, amount: str, day: date, **extra: Any
) -> None:
    make_synced_transaction(
        db, account, amount=amount, booking_date=day, category_id=category.id, **extra
    )


def _create(client: TestClient, category: Category, amount: str, **extra: object) -> dict[str, Any]:
    response = client.post(
        "/api/budgets", json={"category_id": category.id, "amount": amount, **extra}
    )
    assert response.status_code == 201, response.text
    result: dict[str, Any] = response.json()
    return result


# --- Creazione e validazione ---------------------------------------------------------------------


def test_create_list_and_validation(client: TestClient, seeded: Session, today: date) -> None:
    uscite = _category(seeded, "uscite")
    created = _create(client, uscite, "150.00")
    assert created["name"] == "Uscite"
    assert created["valid_from"] == "2026-09-01"
    assert created["alert_threshold_pct"] == 80
    assert created["level"] == "ok"

    overview = client.get("/api/budgets").json()
    assert overview["month"] == "2026-09"
    assert overview["is_current"] is True
    assert overview["days_elapsed"] == 10
    assert [i["id"] for i in overview["items"]] == [created["id"]]

    duplicate = client.post("/api/budgets", json={"category_id": uscite.id, "amount": "90.00"})
    assert duplicate.status_code == 409

    investimenti = _category(seeded, "investimenti")
    abbonamenti = _category(seeded, "abbonamenti")
    trasporti = _category(seeded, "trasporti")
    for body in (
        {"category_id": investimenti.id, "amount": "100.00"},  # non è una spesa
        {"category_id": uscite.id, "amount": 99.5},  # float
        {"category_id": uscite.id, "amount": "0.00"},
        {"category_id": uscite.id, "amount": "10.00", "alert_threshold_pct": 120},
        {"category_id": 999999, "amount": "10.00"},
        {
            "category_id": trasporti.id,
            "subcategory_id": _sub(seeded, abbonamenti, "cloud").id,
            "amount": "10.00",
        },
    ):
        assert client.post("/api/budgets", json=body).status_code == 422, body

    assert client.get("/api/budgets", params={"month": "2026-10"}).status_code == 422
    assert client.get("/api/budgets", params={"month": "2026-13"}).status_code == 422


# --- Speso e soglie ----------------------------------------------------------------------------


def test_spent_counts_real_spending_only(
    client: TestClient, seeded: Session, account: Account, today: date
) -> None:
    uscite = _category(seeded, "uscite")
    _spend(seeded, account, uscite, "-50.00", date(2026, 9, 2))
    _spend(seeded, account, uscite, "-30.00", date(2026, 9, 5))
    _spend(seeded, account, uscite, "10.00", date(2026, 9, 6), kind="refund")
    _spend(seeded, account, uscite, "-99.00", date(2026, 9, 6), kind="internal_transfer")
    _spend(seeded, account, uscite, "-40.00", date(2026, 8, 30))  # mese scorso
    budget = _create(client, uscite, "100.00")
    assert budget["spent_eur"] == "70.00"
    assert budget["remaining_eur"] == "30.00"
    assert budget["used_pct"] == 70.0
    assert budget["level"] == "ok"

    _spend(seeded, account, uscite, "-10.00", date(2026, 9, 8))  # 80%: soglia di avviso
    [item] = client.get("/api/budgets").json()["items"]
    assert (item["used_pct"], item["level"]) == (80.0, "warning")

    _spend(seeded, account, uscite, "-20.00", date(2026, 9, 9))  # 100%
    overview = client.get("/api/budgets").json()
    [item] = overview["items"]
    assert (item["used_pct"], item["level"], item["remaining_eur"]) == (100.0, "over", "0.00")
    assert (overview["warning_count"], overview["over_count"]) == (0, 1)
    assert item["projected_over"] is False  # già sforato: l'avviso è "over"


def test_custom_threshold(
    client: TestClient, seeded: Session, account: Account, today: date
) -> None:
    spesa = _category(seeded, "spesa")
    _spend(seeded, account, spesa, "-60.00", date(2026, 9, 3))
    budget = _create(client, spesa, "100.00", alert_threshold_pct=50)
    assert budget["level"] == "warning"
    patched = client.patch(f"/api/budgets/{budget['id']}", json={"alert_threshold_pct": 70})
    assert patched.json()["id"] == budget["id"]  # la soglia non crea una nuova versione
    assert patched.json()["level"] == "ok"


def test_subcategory_budget_and_totals(
    client: TestClient, seeded: Session, account: Account, today: date
) -> None:
    abbonamenti = _category(seeded, "abbonamenti")
    ai, cloud = _sub(seeded, abbonamenti, "software"), _sub(seeded, abbonamenti, "cloud")
    _spend(seeded, account, abbonamenti, "-20.00", date(2026, 9, 3), subcategory_id=ai.id)
    _spend(seeded, account, abbonamenti, "-2.99", date(2026, 9, 4), subcategory_id=cloud.id)
    whole = _create(client, abbonamenti, "40.00")
    only_ai = _create(client, abbonamenti, "25.00", subcategory_id=ai.id)
    assert whole["spent_eur"] == "22.99"
    assert only_ai["spent_eur"] == "20.00"
    assert only_ai["name"] == "Abbonamenti › Software e AI"

    overview = client.get("/api/budgets").json()
    # La sottocategoria è già dentro il budget della categoria: non si somma due volte.
    assert overview["total_amount"] == "40.00"
    assert overview["total_spent_eur"] == "22.99"


# --- Proiezione -----------------------------------------------------------------------------------


def test_projection_blends_this_month_with_the_last_three() -> None:
    # Giorno 10 di 30: 100 € spesi (10 €/giorno). Senza storico la proiezione è lineare.
    assert _project(
        spent=Decimal(100),
        recurring_spent=Decimal(0),
        recurring_left=Decimal(0),
        history=[],
        elapsed=10,
        days_in_month=30,
    ) == Decimal("300.00")
    # Con 3 mesi da ~304 € (10 €/giorno) e lo stesso ritmo, la stima non cambia di molto.
    history = [_Cell(total=Decimal("304.40")) for _ in range(3)]
    projected = _project(
        spent=Decimal(100),
        recurring_spent=Decimal(0),
        recurring_left=Decimal(0),
        history=history,
        elapsed=10,
        days_in_month=30,
    )
    assert abs(projected - Decimal(300)) < Decimal("0.5")
    # Gli addebiti ricorrenti già pagati non si proiettano; quelli attesi si aggiungono una volta.
    assert _project(
        spent=Decimal(130),
        recurring_spent=Decimal(30),
        recurring_left=Decimal(50),
        history=[],
        elapsed=10,
        days_in_month=30,
    ) == Decimal("380.00")


def test_projection_includes_expected_recurring_charges(
    client: TestClient, seeded: Session, account: Account, today: date
) -> None:
    casa = _category(seeded, "casa")
    _spend(seeded, account, casa, "-20.00", date(2026, 9, 5))
    seeded.add(
        RecurringTransaction(
            name="Affitto",
            match_key="cp:rossi maria",
            direction="out",
            kind="expense",
            category_id=casa.id,
            frequency="monthly",
            expected_amount=Decimal("520.00"),
            next_expected_date=date(2026, 9, 28),
            last_seen_date=date(2026, 8, 28),
            status="confirmed",
        )
    )
    seeded.commit()
    budget = _create(client, casa, "600.00")
    assert budget["recurring_expected_eur"] == "520.00"
    # 20 € in 10 giorni, senza storico: 2 €/giorno per 20 giorni + 520 € di affitto.
    assert budget["projected_eur"] == "580.00"
    assert budget["projected_over"] is False

    client.patch(f"/api/budgets/{budget['id']}", json={"amount": "550.00"})
    [item] = client.get("/api/budgets").json()["items"]
    assert item["projected_over"] is True
    assert item["level"] == "ok"


# --- Versioni e storico -------------------------------------------------------------------------


def test_changing_the_amount_keeps_the_history(
    client: TestClient, seeded: Session, account: Account, today: date
) -> None:
    viaggi = _category(seeded, "viaggi")
    old = Budget(category_id=viaggi.id, amount=Decimal("200.00"), valid_from=date(2026, 7, 1))
    seeded.add(old)
    seeded.commit()
    _spend(seeded, account, viaggi, "-250.00", date(2026, 7, 12))
    _spend(seeded, account, viaggi, "-80.00", date(2026, 9, 2))

    patched = client.patch(f"/api/budgets/{old.id}", json={"amount": "300.00"}).json()
    assert patched["id"] != old.id
    assert patched["valid_from"] == "2026-09-01"
    seeded.refresh(old)
    assert old.valid_to == date(2026, 8, 31)
    assert old.is_active is False

    history = {h["month"]: h for h in patched["history"]}
    assert list(history) == ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    assert history["2026-06"]["amount"] is None
    assert (history["2026-07"]["amount"], history["2026-07"]["spent_eur"]) == ("200.00", "250.00")
    assert history["2026-09"]["amount"] == "300.00"

    july = client.get("/api/budgets", params={"month": "2026-07"}).json()
    assert july["is_current"] is False
    [item] = july["items"]
    assert (item["amount"], item["level"], item["projected_eur"]) == ("200.00", "over", "250.00")

    # Un budget chiuso non si modifica più.
    assert client.patch(f"/api/budgets/{old.id}", json={"amount": "1.00"}).status_code == 409


def test_delete_removes_from_this_month_on(
    client: TestClient, seeded: Session, account: Account, today: date
) -> None:
    viaggi, regali = _category(seeded, "viaggi"), _category(seeded, "regali")
    old = Budget(category_id=viaggi.id, amount=Decimal("200.00"), valid_from=date(2026, 6, 1))
    seeded.add(old)
    seeded.commit()
    fresh = _create(client, regali, "50.00")

    assert client.delete(f"/api/budgets/{fresh['id']}").status_code == 204
    assert seeded.get(Budget, fresh["id"]) is None  # creato questo mese: sparisce del tutto
    assert client.delete(f"/api/budgets/{old.id}").status_code == 204
    seeded.refresh(old)
    assert old.valid_to == date(2026, 8, 31)

    assert client.get("/api/budgets").json()["items"] == []
    august = client.get("/api/budgets", params={"month": "2026-08"}).json()
    assert [i["id"] for i in august["items"]] == [old.id]
    # Si può ricreare dal mese corrente.
    assert _create(client, viaggi, "250.00")["valid_from"] == "2026-09-01"
    assert client.delete("/api/budgets/999999").status_code == 404


def test_suggestion(client: TestClient, seeded: Session, account: Account, today: date) -> None:
    spesa = _category(seeded, "spesa")
    for month, amount in ((6, "-90.00"), (7, "-120.00"), (8, "-150.00"), (9, "-40.00")):
        _spend(seeded, account, spesa, amount, date(2026, month, 5))
    response = client.get("/api/budgets/suggestion", params={"category_id": spesa.id})
    assert response.json() == {
        "average_3m": "120.00",
        "average_6m": "120.00",  # i mesi prima dei primi dati non contano
        "last_month": "150.00",
        "current_month": "40.00",
    }
    invest = _category(seeded, "investimenti")
    assert (
        client.get("/api/budgets/suggestion", params={"category_id": invest.id}).status_code == 422
    )


def test_category_merge_sums_open_budgets(client: TestClient, seeded: Session, today: date) -> None:
    uscite, regali = _category(seeded, "uscite"), _category(seeded, "regali")
    created = client.post("/api/categories", json={"name": "Aperitivi", "kind": "expense"})
    assert created.status_code == 201, created.text
    aperitivi = seeded.get(Category, created.json()["id"])
    assert aperitivi is not None
    _create(client, uscite, "100.00")
    _create(client, aperitivi, "40.00")
    _create(client, regali, "30.00")

    merged = client.post(f"/api/categories/{aperitivi.id}/merge", json={"into_id": uscite.id})
    assert merged.status_code == 200, merged.text
    amounts = {i["name"]: i["amount"] for i in client.get("/api/budgets").json()["items"]}
    assert amounts == {"Uscite": "140.00", "Regali": "30.00"}
