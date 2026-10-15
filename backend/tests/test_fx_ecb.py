from __future__ import annotations

import io
import zipfile
from datetime import date
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion import fx
from app.integrations.ecb import URL_HISTORY, EcbError, EcbRates, fetch_rates
from app.models import FxRate
from app.services.fx import to_eur

CSV = (
    "Date,USD,JPY,GBP,\n"
    "2026-09-22,1.1800,170.10,0.8700,\n"
    "2026-09-21,1.2000,N/A,0.8600,\n"
    "2026-09-18,1.2500,169.00,0.8500,\n"
)


def _zip(text: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("eurofxref-hist.csv", text)
    return buffer.getvalue()


def test_fetch_reads_the_public_history_file() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, content=_zip(CSV))

    rates = fetch_rates(
        date(2026, 9, 19), date(2026, 9, 22), transport=httpx.MockTransport(handler)
    )
    assert seen == [URL_HISTORY]
    assert set(rates) == {date(2026, 9, 21), date(2026, 9, 22)}  # dal giorno chiesto
    assert rates[date(2026, 9, 21)] == {"USD": Decimal("1.2000"), "GBP": Decimal("0.8600")}


def test_fetch_errors_are_readable() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    with pytest.raises(EcbError, match="non disponibili"):
        fetch_rates(date(2026, 9, 1), date(2026, 9, 22), transport=httpx.MockTransport(down))
    with pytest.raises(EcbError, match="non leggibile"):
        fetch_rates(
            date(2026, 9, 1),
            date(2026, 9, 22),
            transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"x")),
        )


def test_ensure_rates_downloads_once_and_converts(db: Session) -> None:
    calls: list[tuple[date, date]] = []

    def fetcher(since: date, today: date) -> EcbRates:
        calls.append((since, today))
        return {
            date(2026, 9, 14): {"USD": Decimal("1.2500")},
            date(2026, 9, 18): {"USD": Decimal("1.2500")},
            date(2026, 9, 21): {"USD": Decimal("1.2000"), "GBP": Decimal("0.86")},
        }

    needed = [("USD", date(2026, 9, 21)), ("EUR", date(2026, 9, 1)), ("USD", date(2026, 9, 20))]
    saved = fx.ensure_rates(db, needed, date(2026, 9, 22), fetcher=fetcher)
    assert saved == 3  # solo USD: la sterlina non serve
    assert calls == [(date(2026, 9, 13), date(2026, 9, 22))]  # una settimana di margine
    assert {r.currency for r in db.scalars(select(FxRate))} == {"USD"}
    # 1 EUR = 1,20 USD → 10 USD = 8,33 EUR; la domenica vale il cambio del venerdì.
    assert to_eur(db, Decimal("10"), "USD", date(2026, 9, 21)) == Decimal("8.33")
    assert to_eur(db, Decimal("10"), "USD", date(2026, 9, 20)) == Decimal("8.00")

    # Già coperti: nessun nuovo download.
    assert fx.ensure_rates(db, needed, date(2026, 9, 22), fetcher=fetcher) == 0
    assert len(calls) == 1


def test_ensure_rates_survives_an_offline_ecb(db: Session) -> None:
    def offline(since: date, today: date) -> EcbRates:
        raise EcbError("Cambi BCE non disponibili")

    assert (
        fx.ensure_rates(db, [("USD", date(2026, 9, 21))], date(2026, 9, 22), fetcher=offline) == 0
    )
