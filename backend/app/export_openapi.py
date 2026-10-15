"""Stampa lo schema OpenAPI dell'API, senza avviare il server.

Usato dal frontend per generare il client tipizzato:
`uv run python -m app.export_openapi > ../frontend/src/api/openapi.json`
"""

from __future__ import annotations

import json
import sys

from app.main import create_app


def main() -> None:
    schema = create_app().openapi()
    json.dump(schema, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
