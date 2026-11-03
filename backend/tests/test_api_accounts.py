from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Account
from tests.conftest import make_synced_transaction


def _create_source(client: TestClient) -> int:
    response = client.post(
        "/api/sources",
        json={"provider": "manual", "institution": "Crédit Agricole Italia", "display_name": "CA"},
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def _account_payload(source_id: int, **overrides: object) -> dict[str, object]:
    return {
        "source_id": source_id,
        "external_id": "cc-1",
        "name": "Carta di credito CA",
        "type": "credit_card",
        "institution": "Crédit Agricole Italia",
    } | overrides


def test_source_output_never_exposes_secrets(client: TestClient) -> None:
    source_id = _create_source(client)
    body = client.get(f"/api/sources/{source_id}").json()
    assert "session_data_encrypted" not in body
    assert "credentials_ref" not in body


def test_account_crud(client: TestClient) -> None:
    source_id = _create_source(client)

    created = client.post("/api/accounts", json=_account_payload(source_id))
    assert created.status_code == 201
    account = created.json()
    assert account["currency"] == "EUR"
    assert account["include_in_net_worth"] is True

    assert [a["id"] for a in client.get("/api/accounts").json()] == [account["id"]]

    patched = client.patch(
        f"/api/accounts/{account['id']}", json={"name": "Visa CA", "color": "#123456"}
    )
    assert patched.status_code == 200
    assert (patched.json()["name"], patched.json()["color"]) == ("Visa CA", "#123456")

    client.patch(f"/api/accounts/{account['id']}", json={"is_active": False})
    assert client.get("/api/accounts").json() == []
    assert len(client.get("/api/accounts", params={"include_inactive": True}).json()) == 1

    assert client.delete(f"/api/accounts/{account['id']}").status_code == 204
    assert client.get(f"/api/accounts/{account['id']}").status_code == 404


def test_account_validation(client: TestClient) -> None:
    source_id = _create_source(client)
    assert client.post("/api/accounts", json=_account_payload(999_999)).status_code == 404
    bad_type = client.post("/api/accounts", json=_account_payload(source_id, type="wallet"))
    assert bad_type.status_code == 422
    bad_currency = client.post("/api/accounts", json=_account_payload(source_id, currency="eur"))
    assert bad_currency.status_code == 422
    unknown_field = client.post("/api/accounts", json=_account_payload(source_id, foo="bar"))
    assert unknown_field.status_code == 422
    null_name = client.post("/api/accounts", json=_account_payload(source_id))
    assert null_name.status_code == 201
    response = client.patch(f"/api/accounts/{null_name.json()['id']}", json={"name": None})
    assert response.status_code == 422


def test_duplicate_account_returns_conflict(client: TestClient) -> None:
    source_id = _create_source(client)
    assert client.post("/api/accounts", json=_account_payload(source_id)).status_code == 201
    duplicate = client.post("/api/accounts", json=_account_payload(source_id))
    assert duplicate.status_code == 409
    assert duplicate.json()["constraint"] == "uq_accounts_source_id_external_id"
    # La sessione resta utilizzabile dopo l'errore.
    assert client.get("/api/accounts").status_code == 200


def test_account_with_transactions_cannot_be_deleted(
    client: TestClient, db: Session, account: Account
) -> None:
    make_synced_transaction(db, account)
    response = client.delete(f"/api/accounts/{account.id}")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "account.has_transactions"
