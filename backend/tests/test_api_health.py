from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_reports_database_and_migrations(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["environment"] == "test"
    assert body["database"]["ok"] is True
    assert body["database"]["up_to_date"] is True
    assert body["database"]["migration_current"] == body["database"]["migration_head"]


def test_foreign_host_header_is_rejected(client: TestClient) -> None:
    """Protezione dal DNS rebinding: solo Host locali."""
    response = client.get("/api/health", headers={"Host": "evil.example.com"})
    assert response.status_code == 400


def test_cors_allows_only_the_local_frontend(client: TestClient) -> None:
    allowed = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"

    denied = client.options(
        "/api/health",
        headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in denied.headers


def test_openapi_and_docs_are_served(client: TestClient) -> None:
    spec = client.get("/api/openapi.json")
    assert spec.status_code == 200
    paths = spec.json()["paths"]
    assert {"/api/health", "/api/accounts", "/api/categories", "/api/transactions"} <= set(paths)
    assert client.get("/docs").status_code == 200
