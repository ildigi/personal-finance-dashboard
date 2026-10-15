from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import (
    Account,
    Budget,
    Category,
    ManualOverride,
    Merchant,
    Transaction,
    TransactionRule,
)
from app.models.enums import OverrideField
from tests.conftest import make_synced_transaction


def _by_code(client: TestClient, code: str) -> dict[str, Any]:
    return next(c for c in client.get("/api/categories").json() if c["code"] == code)


def test_list_seeded_categories_in_order(client: TestClient, seeded: Session) -> None:
    categories = client.get("/api/categories").json()
    assert len(categories) == 18
    assert categories[0]["name"] == "Sport e palestra"
    assert categories[-1]["name"] == "Altro"
    trasporti = _by_code(client, "trasporti")
    assert [s["name"] for s in trasporti["subcategories"]] == [
        "Bus",
        "Treno",
        "Monopattini e bici",
        "Parcheggi",
    ]


def test_income_types(client: TestClient, seeded: Session) -> None:
    codes = [t["code"] for t in client.get("/api/income-types").json()]
    assert codes == [
        "salary",
        "transfer_received",
        "refund",
        "cashback",
        "interest",
        "dividend",
        "cash",
        "family",
        "other",
    ]


def test_category_crud_and_archive(client: TestClient, seeded: Session) -> None:
    created = client.post("/api/categories", json={"name": "Animali", "icon": "paw-print"})
    assert created.status_code == 201
    category_id = created.json()["id"]
    assert created.json()["subcategories"] == []

    sub = client.post(f"/api/categories/{category_id}/subcategories", json={"name": "Bollette"})
    assert sub.status_code == 201
    sub_id = sub.json()["id"]

    renamed = client.patch(f"/api/subcategories/{sub_id}", json={"name": "Utenze"})
    assert renamed.json()["name"] == "Utenze"

    client.patch(f"/api/subcategories/{sub_id}", json={"is_archived": True})
    casa = next(c for c in client.get("/api/categories").json() if c["id"] == category_id)
    assert casa["subcategories"] == []
    with_archived = client.get("/api/categories", params={"include_archived": True}).json()
    casa_all = next(c for c in with_archived if c["id"] == category_id)
    assert [s["name"] for s in casa_all["subcategories"]] == ["Utenze"]

    client.patch(f"/api/categories/{category_id}", json={"is_archived": True})
    assert all(c["id"] != category_id for c in client.get("/api/categories").json())

    assert client.delete(f"/api/categories/{category_id}").status_code == 204


def test_duplicate_category_name_conflicts(client: TestClient, seeded: Session) -> None:
    response = client.post("/api/categories", json={"name": "Spesa"})
    assert response.status_code == 409
    assert response.json()["constraint"] == "uq_categories_name"


def test_system_categories_are_protected(client: TestClient, seeded: Session) -> None:
    investimenti = _by_code(client, "investimenti")
    assert client.delete(f"/api/categories/{investimenti['id']}").status_code == 409
    response = client.patch(f"/api/categories/{investimenti['id']}", json={"is_archived": True})
    assert response.status_code == 409
    # Rinominare invece è consentito.
    response = client.patch(f"/api/categories/{investimenti['id']}", json={"name": "Investito"})
    assert response.status_code == 200


def test_category_in_use_cannot_be_deleted(
    client: TestClient, seeded: Session, account: Account
) -> None:
    sport = seeded.scalar(select(Category).where(Category.code == "sport"))
    assert sport is not None
    make_synced_transaction(seeded, account, category_id=sport.id)
    response = client.delete(f"/api/categories/{sport.id}")
    assert response.status_code == 409
    assert "archiviala" in response.json()["detail"]


# --- Eliminazione delle sottocategorie ------------------------------------------------------


def _category_with_subs(client: TestClient, name: str, *subs: str) -> tuple[int, list[int]]:
    category = client.post("/api/categories", json={"name": name})
    assert category.status_code == 201, category.text
    category_id: int = category.json()["id"]
    ids = []
    for sub in subs:
        created = client.post(f"/api/categories/{category_id}/subcategories", json={"name": sub})
        assert created.status_code == 201, created.text
        ids.append(created.json()["id"])
    return category_id, ids


def _sub_names(client: TestClient, category_id: int) -> list[str]:
    category = client.get(f"/api/categories/{category_id}").json()
    return [s["name"] for s in category["subcategories"]]


def test_unused_subcategory_is_deleted(client: TestClient, seeded: Session) -> None:
    category_id, (sub_id,) = _category_with_subs(client, "Animali", "Cibo")
    usage = client.get(f"/api/subcategories/{sub_id}/usage").json()
    assert usage == {
        "transactions": 0,
        "rules": 0,
        "budgets": 0,
        "recurring": 0,
        "merchants": 0,
        "overrides": 0,
        "in_use": False,
    }
    assert client.delete(f"/api/subcategories/{sub_id}").status_code == 204
    assert _sub_names(client, category_id) == []
    assert client.get(f"/api/subcategories/{sub_id}/usage").status_code == 404


def test_subcategory_in_use_moves_into_sibling(
    client: TestClient, seeded: Session, account: Account
) -> None:
    category_id, (cibo, salute) = _category_with_subs(client, "Animali", "Cibo", "Salute")
    tx = make_synced_transaction(seeded, account, description="CROCCHETTE NEGOZIO")
    patched = client.patch(f"/api/transactions/{tx.id}", json={"subcategory_id": cibo})
    assert patched.status_code == 200, patched.text
    rule = client.post(
        "/api/rules",
        json={
            "name": "Crocchette",
            "conditions": {"description_contains": "crocchette"},
            "actions": {"subcategory_id": cibo},
        },
    )
    assert rule.status_code == 201, rule.text
    for sub, amount in ((cibo, "40.00"), (salute, "30.00")):
        budget = client.post(
            "/api/budgets",
            json={"category_id": category_id, "subcategory_id": sub, "amount": amount},
        )
        assert budget.status_code == 201, budget.text
    merchant = Merchant(
        name="Negozio animali",
        normalized_key="negozio animali",
        default_category_id=category_id,
        default_subcategory_id=cibo,
    )
    seeded.add(merchant)
    seeded.commit()

    usage = client.get(f"/api/subcategories/{cibo}/usage").json()
    assert usage["in_use"] is True
    assert (usage["transactions"], usage["rules"], usage["budgets"]) == (1, 1, 1)
    assert (usage["merchants"], usage["overrides"], usage["recurring"]) == (1, 1, 0)

    # In uso: niente eliminazione diretta, serve una destinazione.
    refused = client.delete(f"/api/subcategories/{cibo}")
    assert refused.status_code == 409
    assert "sposta" in refused.json()["detail"]

    response = client.post(f"/api/subcategories/{cibo}/merge", json={"into_id": salute})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["moved_transactions"] == 1
    assert [s["name"] for s in body["category"]["subcategories"]] == ["Salute"]

    seeded.expire_all()
    moved = seeded.get(Transaction, tx.id)
    assert moved is not None
    assert (moved.category_id, moved.subcategory_id) == (category_id, salute)
    override = seeded.scalar(
        select(ManualOverride).where(
            ManualOverride.transaction_id == tx.id,
            ManualOverride.field == OverrideField.SUBCATEGORY_ID,
        )
    )
    assert override is not None
    assert override.new_value == str(salute)
    stored_rule = seeded.get(TransactionRule, rule.json()["id"])
    assert stored_rule is not None
    assert stored_rule.actions == {"category_id": category_id, "subcategory_id": salute}
    stored_merchant = seeded.get(Merchant, merchant.id)
    assert stored_merchant is not None
    assert stored_merchant.default_subcategory_id == salute
    # I due budget aperti confluiscono in uno solo.
    budgets = seeded.scalars(select(Budget).where(Budget.category_id == category_id)).all()
    assert [(b.subcategory_id, str(b.amount)) for b in budgets] == [(salute, "70.00")]


def test_subcategory_merge_into_none_keeps_category(
    client: TestClient, seeded: Session, account: Account
) -> None:
    category_id, (cibo,) = _category_with_subs(client, "Animali", "Cibo")
    tx = make_synced_transaction(seeded, account, description="CROCCHETTE NEGOZIO")
    # Prima la categoria, poi la sola sottocategoria: la correzione riguarda solo questa.
    seeded.execute(
        update(Transaction).where(Transaction.id == tx.id).values(category_id=category_id)
    )
    seeded.commit()
    patched = client.patch(f"/api/transactions/{tx.id}", json={"subcategory_id": cibo})
    assert patched.status_code == 200, patched.text
    rule = client.post(
        "/api/rules",
        json={
            "name": "Crocchette",
            "conditions": {"description_contains": "crocchette"},
            "actions": {"subcategory_id": cibo},
        },
    ).json()
    client.post(
        "/api/budgets",
        json={"category_id": category_id, "subcategory_id": cibo, "amount": "40.00"},
    )

    response = client.post(f"/api/subcategories/{cibo}/merge", json={"into_id": None})
    assert response.status_code == 200, response.text
    assert response.json()["category"]["subcategories"] == []

    seeded.expire_all()
    moved = seeded.get(Transaction, tx.id)
    assert moved is not None
    # La correzione manuale resta: il movimento non torna "da classificare".
    assert (moved.category_id, moved.subcategory_id) == (category_id, None)
    assert moved.classification_source == "manual"
    stored_rule = seeded.get(TransactionRule, rule["id"])
    assert stored_rule is not None
    assert stored_rule.actions == {"category_id": category_id}
    # Il budget della sottocategoria non ha più oggetto.
    assert seeded.scalars(select(Budget).where(Budget.category_id == category_id)).all() == []


def test_subcategory_merge_validation(client: TestClient, seeded: Session) -> None:
    _, (cibo, salute) = _category_with_subs(client, "Animali", "Cibo", "Salute")
    _, (altro,) = _category_with_subs(client, "Piante", "Vasi")
    same = client.post(f"/api/subcategories/{cibo}/merge", json={"into_id": cibo})
    assert same.status_code == 409
    other = client.post(f"/api/subcategories/{cibo}/merge", json={"into_id": altro})
    assert other.status_code == 409
    assert "stessa categoria" in other.json()["detail"]
    missing = client.post(f"/api/subcategories/{cibo}/merge", json={"into_id": 999_999})
    assert missing.status_code == 404
    assert client.post(f"/api/subcategories/{salute}/merge", json={}).status_code == 422
