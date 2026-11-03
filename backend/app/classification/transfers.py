"""Abbinamento dei trasferimenti interni (SPEC §11).

Due movimenti formano un trasferimento interno se:
- sono su due conti diversi tuoi;
- hanno importi opposti uguali (tolleranza 0 in EUR; ±2% se c'è di mezzo un cambio);
- le date distano al massimo 3 giorni lavorativi;
- e almeno un indizio è vero: l'IBAN della controparte è di un tuo conto, la descrizione
  contiene una parola chiave (Revolut, Top-up, Ricarica, Giroconto, il tuo nome, ...),
  oppure una regola dice che è un trasferimento.

Senza indizi l'abbinamento è incerto: non viene applicato ma proposto per conferma.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.classification.text import contains_phrase, match_text

MAX_BUSINESS_DAYS = 3
FX_TOLERANCE = Decimal("0.02")

DEFAULT_KEYWORDS: tuple[str, ...] = (
    "revolut",
    "top up",
    "topup",
    "ricarica",
    "giroconto",
    "saldo carta",
    "estratto conto",
    "trasferimento tra conti",
    "transfer from",
    "transfer to",
)


@dataclass(frozen=True)
class TransferCandidate:
    id: int
    account_id: int
    booking_date: date
    amount_eur: Decimal
    currency: str
    text: str  # descrizione + controparte, già normalizzate con `match_text`
    counterparty_iban: str | None
    rule_says_transfer: bool = False


@dataclass(frozen=True)
class TransferMatch:
    out_id: int
    in_id: int
    # Indizio: "own_iban", "keyword:<parola>", "rule"; None = nessun indizio, solo proposta.
    reason: str | None

    @property
    def confident(self) -> bool:
        return self.reason is not None


def normalize_iban(iban: str | None) -> str | None:
    return iban.replace(" ", "").upper() if iban else None


def business_days_between(a: date, b: date) -> int:
    """Giorni lavorativi (lun-ven) da min(a, b) escluso a max(a, b) incluso."""
    start, end = min(a, b), max(a, b)
    days = 0
    current = start
    while current < end:
        current += timedelta(days=1)
        if current.weekday() < 5:
            days += 1
    return days


def amounts_match(out: TransferCandidate, inc: TransferCandidate) -> bool:
    if out.currency == "EUR" and inc.currency == "EUR":
        return out.amount_eur == -inc.amount_eur
    largest = max(abs(out.amount_eur), abs(inc.amount_eur))
    return abs(out.amount_eur + inc.amount_eur) <= largest * FX_TOLERANCE


def _clue(
    out: TransferCandidate,
    inc: TransferCandidate,
    my_ibans: set[str],
    keywords: list[str],
) -> str | None:
    if out.counterparty_iban in my_ibans or inc.counterparty_iban in my_ibans:
        return "own_iban"
    for keyword in keywords:
        if contains_phrase(out.text, keyword) or contains_phrase(inc.text, keyword):
            return f"keyword:{keyword}"
    if out.rule_says_transfer or inc.rule_says_transfer:
        return "rule"
    return None


def match_transfers(
    candidates: list[TransferCandidate],
    *,
    my_ibans: set[str],
    keywords: list[str],
) -> list[TransferMatch]:
    """Abbinamenti certi e proposte; ogni movimento compare al massimo una volta.

    A parità di condizioni vince la coppia con un indizio, poi quella con le date più vicine.
    """
    normalized_keywords = [k for k in (match_text(k) for k in keywords) if k]
    inflows = sorted((c for c in candidates if c.amount_eur > 0), key=lambda c: c.booking_date)
    in_dates = [c.booking_date for c in inflows]
    # 3 giorni lavorativi non superano mai 5 giorni di calendario.
    window = timedelta(days=MAX_BUSINESS_DAYS + 2)

    scored: list[tuple[tuple[int, int, int, int, int], TransferMatch]] = []
    for out in (c for c in candidates if c.amount_eur < 0):
        lo = bisect.bisect_left(in_dates, out.booking_date - window)
        hi = bisect.bisect_right(in_dates, out.booking_date + window)
        for inc in inflows[lo:hi]:
            if inc.account_id == out.account_id or not amounts_match(out, inc):
                continue
            gap = business_days_between(out.booking_date, inc.booking_date)
            if gap > MAX_BUSINESS_DAYS:
                continue
            reason = _clue(out, inc, my_ibans, normalized_keywords)
            calendar_gap = abs((inc.booking_date - out.booking_date).days)
            key = (int(reason is None), gap, calendar_gap, out.id, inc.id)
            scored.append((key, TransferMatch(out.id, inc.id, reason)))

    scored.sort(key=lambda item: item[0])
    used: set[int] = set()
    result: list[TransferMatch] = []
    for _, match in scored:
        if match.out_id in used or match.in_id in used:
            continue
        used.update((match.out_id, match.in_id))
        result.append(match)
    return result
