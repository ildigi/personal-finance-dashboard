"""Cambi di riferimento della Banca Centrale Europea (dati pubblici, sola lettura).

La BCE pubblica ogni giorno lavorativo quante unità di ogni valuta vale 1 EUR. Nessuna
chiave, nessun dato dell'utente nella richiesta: si scarica il file e basta. Si usa lo
storico completo `eurofxref-hist.zip` (un CSV, circa 600 kB): niente XML da analizzare,
e serve solo quando mancano cambi.
"""

from __future__ import annotations

import csv
import io
import zipfile
from datetime import date
from decimal import Decimal, InvalidOperation

import httpx

from app.core.messages import AppError

BASE = "https://www.ecb.europa.eu/stats/eurofxref"
URL_HISTORY = f"{BASE}/eurofxref-hist.zip"
TIMEOUT = httpx.Timeout(30.0, connect=10.0)

#: {giorno: {valuta: unità per 1 EUR}}
EcbRates = dict[date, dict[str, Decimal]]


class EcbError(AppError, RuntimeError):
    pass


def _number(text: str | None) -> Decimal | None:
    try:
        value = Decimal((text or "").strip())
    except InvalidOperation:
        return None
    return value if value > 0 else None


def parse_history_zip(content: bytes) -> EcbRates:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        name = next(n for n in archive.namelist() if n.endswith(".csv"))
        text = archive.read(name).decode("utf-8")
    rates: EcbRates = {}
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        day = (row.pop("Date", "") or "").strip()
        if not day:
            continue
        rates[date.fromisoformat(day)] = {
            currency.strip(): v for currency, raw in row.items() if currency and (v := _number(raw))
        }
    return rates


def fetch_rates(
    since: date, today: date, *, transport: httpx.BaseTransport | None = None
) -> EcbRates:
    """Cambi dal giorno `since` in poi (solo GET di un file pubblico)."""
    try:
        with httpx.Client(timeout=TIMEOUT, transport=transport) as client:
            response = client.get(URL_HISTORY)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise EcbError("fx.ecb_unavailable", error=type(exc).__name__) from None
    try:
        rates = parse_history_zip(response.content)
    except (zipfile.BadZipFile, StopIteration, ValueError):
        raise EcbError("fx.ecb_unreadable") from None
    return {d: r for d, r in rates.items() if since <= d <= today}
