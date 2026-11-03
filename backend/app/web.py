"""Frontend compilato servito dal backend (sul server; in locale c'è Vite).

`STATIC_DIR` = cartella di `pnpm build` (`dist`). Le pagine dell'app sono tutte
`index.html` (le rotte le gestisce React); i file in `assets/` hanno il nome con l'hash e
si possono tenere in cache per sempre.

La pagina ha una Content-Security-Policy stretta: script solo dal sito stesso, più lo
script inline che applica il tema prima del primo disegno, ammesso con il suo hash.
"""

from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.core.messages import http_error

_INLINE_SCRIPT = re.compile(r"<script>(.*?)</script>", re.DOTALL)


def content_security_policy(html: str) -> str:
    hashes = " ".join(
        f"'sha256-{base64.b64encode(hashlib.sha256(s.encode()).digest()).decode()}'"
        for s in _INLINE_SCRIPT.findall(html)
    )
    return "; ".join(
        [
            "default-src 'self'",
            f"script-src 'self' {hashes}".strip(),
            # I grafici impostano stili in linea (attributi style): servono.
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]
    )


def mount_frontend(app: FastAPI, static_dir: Path | None) -> None:
    if static_dir is None or not (static_dir / "index.html").is_file():
        return
    index = (static_dir / "index.html").read_text(encoding="utf-8")
    csp = content_security_policy(index)
    root_files = {p.name for p in static_dir.iterdir() if p.is_file() and p.suffix != ".map"}

    if (static_dir / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False, response_model=None)
    def frontend(path: str) -> HTMLResponse | FileResponse:
        if path.startswith("api/") or path == "api":
            raise http_error(404, "not_found")
        if path in root_files:
            return FileResponse(static_dir / path)
        return HTMLResponse(
            index,
            headers={"Content-Security-Policy": csp, "Cache-Control": "no-cache"},
        )
