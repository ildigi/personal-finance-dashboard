from __future__ import annotations

from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Category, ManualOverride, Subcategory, Transaction
from tests.conftest import make_synced_transaction


def _ids(db: Session) -> dict[str, int]:
    """Id di alcune categorie/sottocategorie del seed, per codice."""
    cats = {c.code: c.id for c in db.scalars(select(Category))}
    subs = {s.code: s.id for s in db.scalars(select(Subcategory))}
    return {
        "abbonamenti": cats["abbonamenti"],
        "trasporti": cats["trasporti"],
        "spesa": cats["spesa"],
        "cloud": subs["cloud"],
        "treno": subs["treno"],
    }


def _create(client: TestClient, account: Account, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "account_id": account.id,
        "booking_date": "2026-09-10",
        "amount": "-12.50",
        "description": "  Caffè   Università ",
    } | overrides
    response = client.post("/api/transactions", json=payload)
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


# --- Inserimento manuale ------------------------------------------------------------


def test_create_manual_transaction(client: TestClient, seeded: Session, account: Account) -> None:
    tx = _create(client, account)
    assert tx["amount"] == "-12.50"  # importi come stringhe
    assert tx["amount_eur"] == "-12.50"
    assert tx["kind"] == "expense"
    assert tx["is_manual"] is True
    assert tx["classification_source"] == "none"
    assert tx["description_clean"] == "Caffè Università"
    assert tx["status"] == "booked"

    stored = seeded.get(Transaction, tx["id"])
    assert stored is not None
    assert len(stored.dedupe_hash) == 64


def test_create_infers_category_from_subcategory(
    client: TestClient, seeded: Session, account: Account
) -> None:
    ids = _ids(seeded)
    tx = _create(client, account, amount="-0.99", subcategory_id=ids["cloud"])
    assert (tx["category_id"], tx["subcategory_id"]) == (ids["abbonamenti"], ids["cloud"])
    assert tx["classification_source"] == "manual"


@pytest.mark.parametrize(
    ("overrides", "fragment"),
    [
        ({"amount": -12.5}, "stringa"),
        ({"amount": "1.234"}, "decimal"),
        ({"currency": "USD"}, "amount_eur"),
        ({"kind": "spesa"}, "kind"),
        ({"description": ""}, "description"),
    ],
)
def test_create_validation(
    client: TestClient, account: Account, overrides: dict[str, Any], fragment: str
) -> None:
    payload = {
        "account_id": account.id,
        "booking_date": "2026-09-10",
        "amount": "-12.50",
        "description": "x",
    } | overrides
    response = client.post("/api/transactions", json=payload)
    assert response.status_code == 422
    assert fragment in response.text


def test_create_rejects_mismatched_subcategory(
    client: TestClient, seeded: Session, account: Account
) -> None:
    ids = _ids(seeded)
    response = client.post(
        "/api/transactions",
        json={
            "account_id": account.id,
            "booking_date": "2026-09-10",
            "amount": "-3.00",
            "description": "x",
            "category_id": ids["spesa"],
            "subcategory_id": ids["treno"],
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "subcategory.wrong_category"


def test_create_foreign_currency(client: TestClient, account: Account) -> None:
    tx = _create(client, account, amount="-20.00", currency="USD", amount_eur="-18.40")
    assert (tx["currency"], tx["amount"], tx["amount_eur"]) == ("USD", "-20.00", "-18.40")


def test_unknown_account_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/transactions",
        json={
            "account_id": 999_999,
            "booking_date": "2026-09-10",
            "amount": "1",
            "description": "x",
        },
    )
    assert response.status_code == 422


# --- Elenco, filtri, paginazione ------------------------------------------------------


@pytest.fixture
def sample(seeded: Session, account: Account) -> dict[str, Transaction]:
    ids = _ids(seeded)
    return {
        "stipendio": make_synced_transaction(
            seeded, account, amount="1500.00", description="BONIFICO STIPENDIO ACME",
            booking_date=date(2026, 8, 27),
        ),
        "treno": make_synced_transaction(
            seeded, account, amount="-9.90", description="TRENITALIA MILANO",
            booking_date=date(2026, 9, 3), category_id=ids["trasporti"],
            subcategory_id=ids["treno"],
        ),
        "bar": make_synced_transaction(
            seeded, account, amount="-2.20", description="BAR 100% CAFFE",
            booking_date=date(2026, 9, 5),
        ),
        "cloud": make_synced_transaction(
            seeded, account, amount="-0.99", description="APPLE.COM/BILL",
            booking_date=date(2026, 9, 12), category_id=ids["abbonamenti"],
            subcategory_id=ids["cloud"], status="pending",
        ),
    }  # fmt: skip


def _list(client: TestClient, **params: Any) -> dict[str, Any]:
    response = client.get("/api/transactions", params=params)
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def _descriptions(page: dict[str, Any]) -> list[str]:
    return [item["description_clean"] for item in page["items"]]


def test_list_default_order_and_totals(client: TestClient, sample: dict[str, Transaction]) -> None:
    page = _list(client)
    assert _descriptions(page) == [
        "APPLE.COM/BILL",
        "BAR 100% CAFFE",
        "TRENITALIA MILANO",
        "BONIFICO STIPENDIO ACME",
    ]
    assert page["total"] == 4
    assert page["totals"] == {
        "count": 4,
        "inflow_eur": "1500.00",
        "outflow_eur": "-13.09",
    }


def test_list_pagination(client: TestClient, sample: dict[str, Transaction]) -> None:
    first = _list(client, limit=2, offset=0)
    second = _list(client, limit=2, offset=2)
    assert len(first["items"]) == len(second["items"]) == 2
    assert first["total"] == second["total"] == 4
    assert set(_descriptions(first)).isdisjoint(_descriptions(second))
    assert client.get("/api/transactions", params={"limit": 501}).status_code == 422


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        (
            {"date_from": "2026-09-01", "date_to": "2026-09-05"},
            ["BAR 100% CAFFE", "TRENITALIA MILANO"],
        ),
        ({"q": "trenitalia"}, ["TRENITALIA MILANO"]),
        ({"q": "100%"}, ["BAR 100% CAFFE"]),  # % trattato come carattere, non jolly
        ({"q": "_"}, []),
        ({"uncategorized": True}, ["BAR 100% CAFFE", "BONIFICO STIPENDIO ACME"]),
        ({"kind": "income"}, ["BONIFICO STIPENDIO ACME"]),
        ({"status": "pending"}, ["APPLE.COM/BILL"]),
        ({"amount_min": "-5", "amount_max": "0"}, ["APPLE.COM/BILL", "BAR 100% CAFFE"]),
        ({"sort": "amount_asc", "limit": 1}, ["TRENITALIA MILANO"]),
    ],
)
def test_list_filters(
    client: TestClient,
    sample: dict[str, Transaction],
    params: dict[str, Any],
    expected: list[str],
) -> None:
    assert _descriptions(_list(client, **params)) == expected


def test_list_filters_by_category_and_account(
    client: TestClient, seeded: Session, sample: dict[str, Transaction], account: Account
) -> None:
    ids = _ids(seeded)
    assert _descriptions(_list(client, category_id=ids["abbonamenti"])) == ["APPLE.COM/BILL"]
    assert _list(client, account_id=[account.id])["total"] == 4
    assert _list(client, account_id=[999_999])["total"] == 0


# --- Correzioni e override ------------------------------------------------------------


def test_correcting_a_synced_transaction_records_overrides(
    client: TestClient, seeded: Session, sample: dict[str, Transaction]
) -> None:
    ids = _ids(seeded)
    bar = sample["bar"]

    response = client.patch(
        f"/api/transactions/{bar.id}",
        json={"subcategory_id": ids["treno"], "notes": "era il treno"},
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["category_id"], body["subcategory_id"]) == (ids["trasporti"], ids["treno"])
    assert body["classification_source"] == "manual"
    overrides = {o["field"]: o for o in body["overrides"]}
    assert set(overrides) == {"category_id", "subcategory_id", "notes"}
    assert overrides["category_id"]["old_value"] is None
    assert overrides["category_id"]["new_value"] == str(ids["trasporti"])

    # Seconda correzione: vale l'ultima, ma resta il valore originale.
    client.patch(f"/api/transactions/{bar.id}", json={"category_id": ids["spesa"]})
    rows = {
        o.field: o
        for o in seeded.scalars(
            select(ManualOverride).where(ManualOverride.transaction_id == bar.id)
        )
    }
    assert rows["category_id"].old_value is None
    assert rows["category_id"].new_value == str(ids["spesa"])
    # Cambiando categoria la sottocategoria incompatibile viene tolta: torna vuota come
    # all'origine, quindi la sua correzione si annulla (la categoria resta corretta).
    assert "subcategory_id" not in rows
    assert seeded.get(Transaction, bar.id).subcategory_id is None  # type: ignore[union-attr]


def test_changing_category_keeps_compatible_subcategory(
    client: TestClient, seeded: Session, sample: dict[str, Transaction]
) -> None:
    ids = _ids(seeded)
    cloud = sample["cloud"]
    body = client.patch(
        f"/api/transactions/{cloud.id}", json={"category_id": ids["abbonamenti"]}
    ).json()
    assert body["subcategory_id"] == ids["cloud"]


def test_kind_correction_and_rule_reset(
    client: TestClient, seeded: Session, sample: dict[str, Transaction]
) -> None:
    body = client.patch(
        f"/api/transactions/{sample['stipendio'].id}", json={"kind": "internal_transfer"}
    ).json()
    assert body["kind"] == "internal_transfer"
    assert body["rule_id"] is None
    assert [o["field"] for o in body["overrides"]] == ["kind"]


def test_synced_transaction_data_is_immutable(
    client: TestClient, sample: dict[str, Transaction]
) -> None:
    tx_id = sample["bar"].id
    response = client.patch(f"/api/transactions/{tx_id}", json={"amount": "-1.00"})
    assert response.status_code == 409
    assert client.delete(f"/api/transactions/{tx_id}").status_code == 409


def test_manual_transaction_can_be_edited_and_deleted(
    client: TestClient, seeded: Session, account: Account
) -> None:
    tx = _create(client, account)
    old_hash = seeded.get(Transaction, tx["id"]).dedupe_hash  # type: ignore[union-attr]

    response = client.patch(
        f"/api/transactions/{tx['id']}",
        json={"amount": "-13.00", "description": "Caffè e brioche"},
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["amount"], body["amount_eur"]) == ("-13.00", "-13.00")
    assert body["description_raw"] == "Caffè e brioche"
    assert body["overrides"] == []  # i movimenti manuali non hanno bisogno di override
    assert seeded.get(Transaction, tx["id"]).dedupe_hash != old_hash  # type: ignore[union-attr]

    assert client.delete(f"/api/transactions/{tx['id']}").status_code == 204
    assert client.get(f"/api/transactions/{tx['id']}").status_code == 404


def test_patch_rejects_null_on_required_fields(
    client: TestClient, sample: dict[str, Transaction]
) -> None:
    response = client.patch(f"/api/transactions/{sample['bar'].id}", json={"kind": None})
    assert response.status_code == 422


def test_detail_includes_raw_payload(client: TestClient, sample: dict[str, Transaction]) -> None:
    body = client.get(f"/api/transactions/{sample['bar'].id}").json()
    assert body["raw"] == {"provider": "mock", "id": "abc"}
    assert body["tags"] == []
    assert client.get("/api/transactions/999999").status_code == 404
