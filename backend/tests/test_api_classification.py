"""API della Fase 5: regole, apprendimento, azioni multiple, trasferimenti, merchant, analisi."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.mock_setup import ensure_mock_sources
from app.ingestion.runner import run_sync
from app.models import Account, Category, Merchant, Transaction, TransactionRule
from app.models.enums import ClassificationSource, TransactionKind
from app.services.analytics import previous_period, shift_months
from tests.conftest import make_synced_transaction

DAY = date(2026, 9, 15)


@pytest.fixture
def mock_db(seeded: Session) -> Session:
    for source in ensure_mock_sources(seeded):
        assert run_sync(seeded, source, today=DAY).status == "success"
    seeded.commit()
    return seeded


def _category(db: Session, code: str) -> Category:
    category = db.scalar(select(Category).where(Category.code == code))
    assert category is not None
    return category


# --- Regole -----------------------------------------------------------------------------------


def test_rules_are_listed_user_first_then_seed(client: TestClient, seeded: Session) -> None:
    regali = _category(seeded, "regali")
    created = client.post(
        "/api/rules",
        json={
            "name": "Fiori",
            "priority": 999,
            "conditions": {"description_contains": "fioraio"},
            "actions": {"category_id": regali.id},
        },
    )
    assert created.status_code == 201, created.text
    rules = client.get("/api/rules").json()
    assert rules[0]["name"] == "Fiori"
    assert rules[0]["origin"] == "user"
    assert {r["origin"] for r in rules[1:]} == {"seed"}


def test_rule_validation(client: TestClient, seeded: Session) -> None:
    bad = [
        {"name": "x", "conditions": {}, "actions": {"kind": "fee"}},
        {"name": "x", "conditions": {"description_regex": "("}, "actions": {"kind": "fee"}},
        {"name": "x", "conditions": {"direction": "out"}, "actions": {}},
        {"name": "x", "conditions": {"amounts": [9.99]}, "actions": {"kind": "fee"}},
        {"name": "x", "conditions": {"direction": "out"}, "actions": {"category_id": 999999}},
    ]
    for body in bad:
        assert client.post("/api/rules", json=body).status_code == 422, body


def test_seed_rules_can_be_disabled_but_not_edited_or_deleted(
    client: TestClient, seeded: Session
) -> None:
    rule = seeded.scalar(select(TransactionRule).where(TransactionRule.code == "apple_icloud"))
    assert rule is not None
    assert client.delete(f"/api/rules/{rule.id}").status_code == 409
    edit = client.patch(f"/api/rules/{rule.id}", json={"actions": {"kind": "fee"}})
    assert edit.status_code == 409
    disabled = client.patch(f"/api/rules/{rule.id}", json={"is_active": False})
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False


def test_preview_create_and_reorder(client: TestClient, mock_db: Session) -> None:
    regali = _category(mock_db, "regali")
    amazon = mock_db.scalar(select(Merchant).where(Merchant.normalized_key == "amazon"))
    assert amazon is not None
    body = {
        "name": "Amazon a dicembre → Regali",
        "conditions": {"merchant_id": amazon.id, "direction": "out", "amount_min": "15"},
        "actions": {"category_id": regali.id},
    }
    preview = client.post("/api/rules/preview", json=body).json()
    assert preview["matched"] > 0
    assert preview["changed"] > 0
    change = preview["changes"][0]
    assert change["after_category_id"] == regali.id
    assert change["before_category_id"] != regali.id
    # L'anteprima non salva nulla.
    assert (
        mock_db.scalar(select(TransactionRule).where(TransactionRule.name == body["name"])) is None
    )

    created = client.post("/api/rules", json=body).json()
    assert created["match_count"] == preview["matched"] - preview["blocked"]
    other = client.post(
        "/api/rules",
        json={
            **body,
            "name": "Altra",
            "actions": {"category_id": _category(mock_db, "vestiti").id},
        },
    ).json()
    # La seconda (stesse condizioni, priorità uguale ma id più alto) non vince mai.
    assert other["match_count"] == 0
    reordered = client.post("/api/rules/reorder", json={"rule_ids": [other["id"], created["id"]]})
    assert reordered.status_code == 200
    by_id = {r["id"]: r for r in reordered.json()}
    assert by_id[other["id"]]["match_count"] == created["match_count"]
    assert by_id[created["id"]]["match_count"] == 0


def test_classification_stats_and_run(client: TestClient, mock_db: Session) -> None:
    stats = client.get("/api/classification/stats").json()
    assert stats["total"] > 300
    assert stats["auto_pct"] > 90
    assert stats["active_rules"] >= 9
    run = client.post("/api/classification/run").json()
    assert run["changed"] == 0
    assert run["transfer_pairs"] > 0


# --- Correzioni, apprendimento, azioni multiple -----------------------------------------------


def test_learn_from_correction_creates_rule_for_past_and_future(
    client: TestClient, mock_db: Session
) -> None:
    netflix = mock_db.scalar(select(Merchant).where(Merchant.normalized_key == "netflix"))
    assert netflix is not None
    txs = list(
        mock_db.scalars(
            select(Transaction)
            .where(Transaction.merchant_id == netflix.id)
            .order_by(Transaction.booking_date)
        )
    )
    uscite = _category(mock_db, "uscite")
    patched = client.patch(f"/api/transactions/{txs[0].id}", json={"category_id": uscite.id})
    assert patched.status_code == 200
    assert patched.json()["classification_note"] == "Correzione manuale"

    suggestion = client.get(f"/api/transactions/{txs[0].id}/learn").json()
    assert suggestion["subject"] == "Netflix"
    assert suggestion["similar_count"] == len(txs) - 1
    assert suggestion["conditions"]["merchant_id"] == netflix.id

    result = client.post(f"/api/transactions/{txs[0].id}/learn", json={"scope": "rule"}).json()
    assert result["updated"] == len(txs) - 1
    assert result["rule"]["origin"] == "learned"
    for tx in txs[1:]:
        mock_db.refresh(tx)
        assert tx.category_id == uscite.id
        assert tx.classification_source == ClassificationSource.RULE
    # Nessun altro movimento da sistemare: niente più proposta.
    assert client.get(f"/api/transactions/{txs[0].id}/learn").json()["similar_count"] == 0


def test_learn_past_only_records_manual_corrections(client: TestClient, mock_db: Session) -> None:
    iliad = mock_db.scalar(select(Merchant).where(Merchant.normalized_key == "iliad"))
    assert iliad is not None
    txs = list(mock_db.scalars(select(Transaction).where(Transaction.merchant_id == iliad.id)))
    regali = _category(mock_db, "regali")
    client.patch(f"/api/transactions/{txs[0].id}", json={"category_id": regali.id})
    result = client.post(f"/api/transactions/{txs[0].id}/learn", json={"scope": "past"}).json()
    assert result == {"updated": len(txs) - 1, "rule": None}
    assert all(
        t.category_id == regali.id and t.classification_source == ClassificationSource.MANUAL
        for t in txs
    )


def test_learn_without_correction_is_empty(client: TestClient, mock_db: Session) -> None:
    tx = mock_db.scalars(select(Transaction).limit(1)).one()
    assert client.get(f"/api/transactions/{tx.id}/learn").json() is None
    assert (
        client.post(f"/api/transactions/{tx.id}/learn", json={"scope": "rule"}).status_code == 409
    )


def test_bulk_update_and_tags(client: TestClient, seeded: Session, account: Account) -> None:
    txs = [make_synced_transaction(seeded, account, amount="-3.00") for _ in range(3)]
    tag = client.post("/api/tags", json={"name": "vacanza"}).json()
    regali = _category(seeded, "regali")
    body = {"ids": [t.id for t in txs], "add_tag_ids": [tag["id"]], "category_id": regali.id}
    assert client.post("/api/transactions/bulk", json=body).json() == {"updated": 3}
    page = client.get("/api/transactions").json()
    assert all(item["tags"][0]["name"] == "vacanza" for item in page["items"])
    assert {item["category_id"] for item in page["items"]} == {regali.id}
    removed = client.post(
        "/api/transactions/bulk", json={"ids": [txs[0].id], "remove_tag_ids": [tag["id"]]}
    )
    assert removed.status_code == 200
    assert client.get(f"/api/transactions/{txs[0].id}").json()["tags"] == []
    assert client.post("/api/transactions/bulk", json={"ids": [999999]}).status_code == 404


def test_kind_change_unpairs_transfer(client: TestClient, mock_db: Session) -> None:
    tx = mock_db.scalars(
        select(Transaction).where(Transaction.kind == TransactionKind.INTERNAL_TRANSFER).limit(1)
    ).one()
    partner_id = tx.transfer_pair_id
    response = client.patch(f"/api/transactions/{tx.id}", json={"kind": "expense"}).json()
    assert response["transfer_pair_id"] is None
    partner = client.get(f"/api/transactions/{partner_id}").json()
    assert partner["transfer_pair_id"] is None
    assert partner["kind"] != "internal_transfer"


# --- Trasferimenti ----------------------------------------------------------------------------


def test_transfer_suggestion_confirm_and_dismiss(client: TestClient, mock_db: Session) -> None:
    accounts = list(mock_db.scalars(select(Account).where(Account.type == "checking")))
    out = make_synced_transaction(mock_db, accounts[0], amount="-77.70", description="PAGAMENTO")
    inc = make_synced_transaction(mock_db, accounts[1], amount="77.70", description="Payment")
    suggestions = client.get("/api/transfers/suggestions").json()
    pair = {"out_id": out.id, "in_id": inc.id}
    assert {
        "out_id": suggestions[0]["outflow"]["id"],
        "in_id": suggestions[0]["inflow"]["id"],
    } == pair

    confirmed = client.post("/api/transfers", json=pair).json()
    assert [t["transfer_pair_id"] for t in confirmed] == [inc.id, out.id]
    assert {t["kind"] for t in confirmed} == {"internal_transfer"}
    assert client.get("/api/transfers/suggestions").json() == []

    dismissed = client.post("/api/transfers/dismiss", json=pair).json()
    assert [t["transfer_pair_id"] for t in dismissed] == [None, None]
    assert client.get("/api/transfers/suggestions").json() == []

    wrong = client.post("/api/transfers", json={"out_id": inc.id, "in_id": out.id})
    assert wrong.status_code == 422


# --- Merchant e categorie ---------------------------------------------------------------------


def test_merchants_list_patch_and_merge(client: TestClient, mock_db: Session) -> None:
    page = client.get("/api/merchants").json()
    assert page["total"] > 10
    top = page["items"][0]
    assert Decimal(top["spent_eur"]) >= Decimal(page["items"][1]["spent_eur"])

    bars = client.get("/api/merchants", params={"q": "bar magenta"}).json()["items"]
    assert len(bars) == 1
    bar = bars[0]
    uscite = _category(mock_db, "uscite")
    regali = _category(mock_db, "regali")
    patched = client.patch(
        f"/api/merchants/{bar['id']}",
        json={"name": "Bar Magenta (Milano)", "default_category_id": regali.id},
    ).json()
    assert patched["origin"] == "user"
    # Il default del merchant viene prima dell'MCC: i movimenti passano a Regali.
    txs = client.get("/api/transactions", params={"merchant_id": bar["id"], "limit": 500}).json()
    assert {t["category_id"] for t in txs["items"]} == {regali.id}

    other = client.get("/api/merchants", params={"q": "caffe del corso"}).json()["items"][0]
    merged = client.post(f"/api/merchants/{other['id']}/merge", json={"into_id": bar["id"]}).json()
    assert merged["moved_transactions"] == other["transaction_count"]
    assert "caffe del corso" in merged["merchant"]["aliases"]
    assert client.get(f"/api/merchants/{other['id']}").status_code == 404
    after = client.get(f"/api/merchants/{bar['id']}").json()
    assert after["transaction_count"] == bar["transaction_count"] + other["transaction_count"]
    assert uscite.id != regali.id


def test_category_merge(client: TestClient, mock_db: Session) -> None:
    istruzione = _category(mock_db, "istruzione")
    regali = _category(mock_db, "regali")
    count = len(
        mock_db.scalars(
            select(Transaction.id).where(Transaction.category_id == istruzione.id)
        ).all()
    )
    response = client.post(f"/api/categories/{istruzione.id}/merge", json={"into_id": regali.id})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["moved_transactions"] == count
    assert {s["name"] for s in body["category"]["subcategories"]} >= {
        "Libri",
        "Tasse e corsi",
    }
    # La regola di sistema delle tasse universitarie ora punta a Regali.
    rule = mock_db.scalar(select(TransactionRule).where(TransactionRule.code == "university_fees"))
    assert rule is not None
    assert rule.actions["category_id"] == regali.id
    system = _category(mock_db, "investimenti")
    assert (
        client.post(f"/api/categories/{system.id}/merge", json={"into_id": regali.id}).status_code
        == 409
    )


def test_category_used_by_rule_cannot_be_deleted(client: TestClient, seeded: Session) -> None:
    category = client.post("/api/categories", json={"name": "Animali"}).json()
    client.post(
        "/api/rules",
        json={"name": "Veterinario", "conditions": {"description_contains": "veterinario"},
              "actions": {"category_id": category["id"]}},
    )  # fmt: skip
    assert client.delete(f"/api/categories/{category['id']}").status_code == 409


# --- Analisi ----------------------------------------------------------------------------------


def test_previous_period_compares_same_days() -> None:
    today = date(2026, 10, 5)
    current = previous_period(date(2026, 10, 1), date(2026, 10, 31), today)
    assert (current.date_from, current.date_to) == (date(2026, 9, 1), date(2026, 9, 5))
    last_month = previous_period(date(2026, 9, 1), date(2026, 9, 30), today)
    assert (last_month.date_from, last_month.date_to) == (date(2026, 8, 1), date(2026, 8, 31))
    quarter = previous_period(date(2026, 8, 1), date(2026, 10, 31), today)
    assert (quarter.date_from, quarter.date_to) == (date(2026, 5, 1), date(2026, 7, 5))
    assert shift_months(date(2026, 3, 31), -1) == date(2026, 2, 28)


def test_expenses_summary(client: TestClient, mock_db: Session) -> None:
    body = client.get(
        "/api/analytics/expenses", params={"date_from": "2026-08-01", "date_to": "2026-08-31"}
    ).json()
    total = Decimal(body["total_eur"])
    assert total > 0
    assert sum(Decimal(c["total_eur"]) for c in body["categories"]) == total
    codes = {c["name"] for c in body["categories"]}
    assert "Investimenti" not in codes  # mai nelle spese reali
    assert Decimal(body["invested_eur"]) >= 200  # ma conteggiati a parte
    assert body["previous_period"] == {"date_from": "2026-07-01", "date_to": "2026-07-31"}
    abbonamenti = next(c for c in body["categories"] if c["name"] == "Abbonamenti")
    assert {s["name"] for s in abbonamenti["subcategories"]} >= {
        "Cloud e archiviazione",
        "Software e AI",
    }
    assert body["averages"]["m3"] is not None


def test_refund_reduces_category_spending(
    client: TestClient, seeded: Session, account: Account
) -> None:
    db = seeded
    make_synced_transaction(
        db, account, amount="-40.00", description="ZARA", booking_date=date(2026, 9, 2)
    )
    make_synced_transaction(
        db, account, amount="40.00", description="Refund from ZARA", booking_date=date(2026, 9, 9)
    )
    make_synced_transaction(
        db, account, amount="-15.00", description="ZARA", booking_date=date(2026, 9, 10)
    )
    client.post("/api/classification/run")
    body = client.get(
        "/api/analytics/expenses", params={"date_from": "2026-09-01", "date_to": "2026-09-30"}
    ).json()
    assert Decimal(body["total_eur"]) == Decimal("15.00")
    income = client.get(
        "/api/analytics/income", params={"date_from": "2026-09-01", "date_to": "2026-09-30"}
    ).json()
    assert Decimal(income["total_eur"]) == 0  # il rimborso non è un'entrata


def test_income_and_monthly(client: TestClient, mock_db: Session) -> None:
    income = client.get(
        "/api/analytics/income", params={"date_from": "2026-08-01", "date_to": "2026-08-31"}
    ).json()
    types = {t["code"]: Decimal(t["total_eur"]) for t in income["by_type"]}
    assert types["salary"] >= 1450
    assert "cashback" in types
    assert income["savings_rate_pct"] is not None
    assert Decimal(income["savings_eur"]) == Decimal(income["total_eur"]) - Decimal(
        income["expenses_eur"]
    )

    monthly = client.get("/api/analytics/monthly", params={"months": 6, "end": "2026-09-15"}).json()
    months = monthly["months"]
    assert [m["month"] for m in months] == [
        "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
    ]  # fmt: skip
    august = months[4]
    assert Decimal(august["expenses_eur"]) == Decimal(
        client.get(
            "/api/analytics/expenses",
            params={"date_from": "2026-08-01", "date_to": "2026-08-31"},
        ).json()["total_eur"]
    )

    merchants = client.get(
        "/api/analytics/merchants",
        params={"date_from": "2026-01-01", "date_to": "2026-08-31", "limit": 5},
    ).json()
    assert len(merchants) == 5
    assert merchants[0]["name"] == "Rossi Maria"  # l'affitto
    assert Decimal(merchants[0]["average_eur"]) == Decimal("520.00")


def test_analytics_rejects_bad_ranges(client: TestClient, seeded: Session) -> None:
    bad = {"date_from": "2026-09-30", "date_to": "2026-09-01"}
    assert client.get("/api/analytics/expenses", params=bad).status_code == 422
    huge = {"date_from": "2020-01-01", "date_to": "2026-09-01"}
    assert client.get("/api/analytics/income", params=huge).status_code == 422


def test_uncategorized_is_its_own_line_not_altro(
    client: TestClient, seeded: Session, account: Account
) -> None:
    """ "Da classificare" è uno stato (categoria vuota), separato dalla categoria "Altro"."""
    make_synced_transaction(
        seeded, account, amount="-30.00", description="NEGOZIO SCONOSCIUTO",
        booking_date=date(2026, 9, 3),
    )  # fmt: skip
    make_synced_transaction(
        seeded, account, amount="-2.00", description="CANONE MENSILE CONTO",
        booking_date=date(2026, 9, 30),
    )  # fmt: skip
    client.post("/api/classification/run")
    body = client.get(
        "/api/analytics/expenses", params={"date_from": "2026-09-01", "date_to": "2026-09-30"}
    ).json()
    lines = {c["name"]: (c["category_id"], c["total_eur"]) for c in body["categories"]}
    assert lines["Da classificare"] == (None, "30.00")
    altro = _category(seeded, "altro")
    assert lines["Altro"] == (altro.id, "2.00")
    assert body["unclassified_count"] == 1


def test_reselecting_the_original_value_undoes_the_correction(
    client: TestClient, seeded: Session, account: Account
) -> None:
    tx = make_synced_transaction(seeded, account, amount="-40.00", description="ESSELUNGA")
    client.post("/api/classification/run")
    spesa = _category(seeded, "spesa").id
    regali = _category(seeded, "regali").id
    assert client.get(f"/api/transactions/{tx.id}").json()["category_id"] == spesa

    corrected = client.patch(f"/api/transactions/{tx.id}", json={"category_id": regali}).json()
    assert corrected["classification_source"] == "manual"
    assert [o["field"] for o in corrected["overrides"]] == ["category_id"]

    undone = client.patch(f"/api/transactions/{tx.id}", json={"category_id": spesa}).json()
    assert undone["overrides"] == []
    assert undone["classification_source"] == "merchant"
    assert undone["category_id"] == spesa


def test_reset_restores_automatic_classification(
    client: TestClient, seeded: Session, account: Account
) -> None:
    tx = make_synced_transaction(seeded, account, amount="-40.00", description="ESSELUNGA")
    client.post("/api/classification/run")
    regali = _category(seeded, "regali").id
    client.patch(
        f"/api/transactions/{tx.id}", json={"category_id": regali, "kind": "fee", "notes": "x"}
    )

    reset = client.delete(f"/api/transactions/{tx.id}/overrides")
    assert reset.status_code == 200
    body = reset.json()
    assert (body["kind"], body["category_id"]) == ("expense", _category(seeded, "spesa").id)
    assert body["classification_source"] == "merchant"
    assert [o["field"] for o in body["overrides"]] == ["notes"]  # le note restano
    assert body["notes"] == "x"
    assert client.delete("/api/transactions/999999/overrides").status_code == 404


def test_reset_also_unlocks_manual_transactions(
    client: TestClient, seeded: Session, account: Account
) -> None:
    created = client.post(
        "/api/transactions",
        json={
            "account_id": account.id, "booking_date": "2026-09-10", "amount": "-25.00",
            "description": "ESSELUNGA", "category_id": _category(seeded, "regali").id,
        },
    ).json()  # fmt: skip
    assert created["classification_source"] == "manual"
    body = client.delete(f"/api/transactions/{created['id']}/overrides").json()
    assert body["category_id"] == _category(seeded, "spesa").id
