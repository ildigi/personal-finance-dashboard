from __future__ import annotations

import base64
import hashlib
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app

SCRIPT = "document.documentElement.classList.add('x');"


def _dist(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(
        f'<html><head><script>{SCRIPT}</script><script type="module" src="/assets/app.js">'
        "</script></head><body><div id=root></div></body></html>",
        encoding="utf-8",
    )
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (dist / "assets" / "app.js.map").write_text("{}", encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    return dist


def test_frontend_is_served_with_a_strict_csp(tmp_path: Path) -> None:
    settings = get_settings().model_copy(update={"static_dir": _dist(tmp_path)})
    with TestClient(create_app(settings), base_url="http://localhost") as client:
        page = client.get("/spese")
        assert page.status_code == 200
        assert "<div id=root>" in page.text
        csp = page.headers["content-security-policy"]
        digest = base64.b64encode(hashlib.sha256(SCRIPT.encode()).digest()).decode()
        assert f"script-src 'self' 'sha256-{digest}'" in csp
        assert "frame-ancestors 'none'" in csp
        assert "unsafe-inline" not in csp.split("script-src")[1].split(";")[0]
        assert client.get("/assets/app.js").text == "console.log(1)"
        assert client.get("/favicon.svg").status_code == 200
        # Le API sconosciute restano 404 JSON, non la pagina dell'app.
        missing = client.get("/api/non-esiste")
        assert missing.status_code == 404
        assert missing.headers["content-type"].startswith("application/json")


def test_without_a_build_nothing_is_mounted(client: TestClient) -> None:
    assert client.get("/spese").status_code == 404
