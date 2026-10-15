"""Rilevamento delle ricorrenze (SPEC §16, Fase 6): funzioni pure, senza database.

Una serie è un gruppo di movimenti con
- la stessa controparte (`match_key`) e lo stesso verso (uscita/entrata);
- importi entro ±10% l'uno dall'altro (lo stesso merchant può averne più d'una:
  Apple 0,99 € iCloud e 10,99 € Apple Music);
- date a intervalli regolari: 7, 14, ~30, ~91 o ~365 giorni, con una tolleranza.

Sono ammessi qualche mese saltato (un addebito che non c'è) e qualche movimento in più
troppo vicino al precedente (un acquisto occasionale dello stesso importo): restano fuori
dalla serie. Dopo una pausa di più di tre periodi conta solo la serie ripartita.
Servono almeno 3 occorrenze (4 per settimanali e quindicinali, 2 per le annuali).
"""

from __future__ import annotations

import calendar
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.models.enums import Frequency

AMOUNT_TOLERANCE = Decimal("0.10")
MAX_MISSED_IN_A_ROW = 2  # al massimo due periodi saltati di fila
MAX_EXTRA_SHARE = 0.2  # movimenti in più rispetto a quelli della serie
MAX_MISSED_SHARE = 1 / 3  # periodi senza addebito, sul totale dei periodi coperti
# Nella stessa fascia di importo e nello stesso periodo, la serie deve essere quasi tutto ciò
# che quella controparte addebita: tre spese al supermercato da ~45 € a un mese di distanza
# non sono un abbonamento, se in mezzo ce ne sono altre dieci simili.
MIN_DISTINCTIVENESS = 0.75
_DAYS_PER_MONTH = 365.25 / 12


@dataclass(frozen=True)
class Cadence:
    """Frequenza di una serie: `months` per le mensili/trimestrali/annuali, altrimenti `days`."""

    frequency: Frequency
    interval_days: int | None = None  # solo per `custom`

    @property
    def months(self) -> int | None:
        return {Frequency.MONTHLY: 1, Frequency.QUARTERLY: 3, Frequency.YEARLY: 12}.get(
            self.frequency
        )

    @property
    def days(self) -> float:
        if self.months is not None:
            return self.months * _DAYS_PER_MONTH
        if self.frequency == Frequency.WEEKLY:
            return 7
        return self.interval_days or 1

    @property
    def tolerance(self) -> int:
        """Giorni di scarto ammessi rispetto alla data attesa."""
        fixed = {
            Frequency.WEEKLY: 1,
            Frequency.MONTHLY: 5,
            Frequency.QUARTERLY: 10,
            Frequency.YEARLY: 20,
        }
        return fixed.get(self.frequency) or max(1, round(self.days * 0.15))

    @property
    def min_occurrences(self) -> int:
        if self.frequency == Frequency.YEARLY:
            return 2
        return 4 if self.days <= 14 else 3

    @property
    def per_month(self) -> Decimal:
        """Quante volte cade in un mese, in media (per l'equivalente mensile)."""
        if self.months is not None:
            return Decimal(1) / Decimal(self.months)
        return Decimal(str(_DAYS_PER_MONTH)) / Decimal(str(self.days))

    def next_after(self, last: date, anchor_day: int | None = None) -> date:
        """Data attesa dopo `last`. Le mensili cadono sul giorno `anchor_day` del mese:
        un addebito anticipato al venerdì per il weekend conta per la data nominale."""
        if self.months is None:
            return last + timedelta(days=round(self.days))
        anchor = anchor_day or last.day
        nominal = min(
            (_on_day(_add_months(last, delta), anchor) for delta in (-1, 0, 1)),
            key=lambda d: abs((d - last).days),
        )
        return _on_day(_add_months(nominal, self.months), anchor)


CADENCES = (
    Cadence(Frequency.WEEKLY),
    Cadence(Frequency.CUSTOM, 14),
    Cadence(Frequency.MONTHLY),
    Cadence(Frequency.QUARTERLY),
    Cadence(Frequency.YEARLY),
)


def cadence_for(frequency: str, interval_days: int | None) -> Cadence:
    return Cadence(Frequency(frequency), interval_days if frequency == Frequency.CUSTOM else None)


def _add_months(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    return date(year, month + 1, 1)


def _on_day(first_of_month: date, day: int) -> date:
    last = calendar.monthrange(first_of_month.year, first_of_month.month)[1]
    return first_of_month.replace(day=min(day, last))


# --- Ingressi e uscite --------------------------------------------------------------------------


@dataclass(frozen=True)
class Occurrence:
    id: int
    day: date
    amount: Decimal  # EUR, con segno
    kind: str
    match_key: str
    category_id: int | None = None
    subcategory_id: int | None = None
    merchant_id: int | None = None


@dataclass
class Series:
    match_key: str
    direction: str  # "out" | "in"
    kind: str
    cadence: Cadence
    expected_amount: Decimal  # positivo
    last_seen: date
    next_expected: date
    anchor_day: int | None
    occurrence_ids: list[int]
    occurrences: int  # date distinte nella serie
    missed: int
    extras: int
    confidence: Decimal
    category_id: int | None
    subcategory_id: int | None
    merchant_id: int | None

    def is_active(self, today: date) -> bool:
        """Ancora in corso: l'ultimo addebito non è più vecchio di un periodo e mezzo."""
        return (today - self.last_seen).days <= self.cadence.days * 1.5 + self.cadence.tolerance


def amount_matches(amount: Decimal, expected: Decimal, tolerance_pct: Decimal) -> bool:
    return abs(abs(amount) - expected) <= expected * tolerance_pct / 100


# --- Algoritmo ------------------------------------------------------------------------------------


def _amount_clusters(items: list[Occurrence]) -> list[list[Occurrence]]:
    """Gruppi di importi entro ±10% da un importo centrale, il più numeroso per primo."""
    remaining = sorted(items, key=lambda o: (abs(o.amount), o.day, o.id))
    clusters: list[list[Occurrence]] = []
    while len(remaining) >= 2:
        best: list[Occurrence] = []
        best_spread = Decimal(0)
        for center in sorted({abs(o.amount) for o in remaining}):
            members = [
                o for o in remaining if abs(abs(o.amount) - center) <= center * AMOUNT_TOLERANCE
            ]
            spread = abs(members[-1].amount) - abs(members[0].amount)
            if len(members) > len(best) or (len(members) == len(best) and spread < best_spread):
                best, best_spread = members, spread
        if len(best) < 2:
            break
        clusters.append(best)
        chosen = {o.id for o in best}
        remaining = [o for o in remaining if o.id not in chosen]
    return clusters


@dataclass
class _Fit:
    cadence: Cadence
    kept: list[date]
    missed: int
    extras: int
    deviation: float  # scarto medio dalla cadenza, in giorni


def _fit(days: list[date], cadence: Cadence) -> _Fit | None:
    """Prova a leggere le date come una serie con questa cadenza."""
    period, tol = cadence.days, cadence.tolerance
    kept = [days[0]]
    missed = extras = 0
    deviations: list[float] = []
    for day in days[1:]:
        gap = (day - kept[-1]).days
        if gap < period - tol:
            extras += 1  # troppo vicino al precedente: non fa parte della serie
            continue
        periods = max(1, round(gap / period))
        if periods > MAX_MISSED_IN_A_ROW + 1:
            # Pausa lunga: conta solo la serie ripartita dopo (es. abbonamento ripreso).
            kept, missed, extras, deviations = [day], 0, 0, []
            continue
        deviation = abs(gap / periods - period)
        if deviation > tol:
            return None
        missed += periods - 1
        deviations.append(deviation)
        kept.append(day)
    if (
        len(kept) < cadence.min_occurrences
        or extras > len(kept) * MAX_EXTRA_SHARE
        or missed > max(1, (len(kept) + missed) * MAX_MISSED_SHARE)
    ):
        return None
    return _Fit(cadence, kept, missed, extras, statistics.fmean(deviations))


def _best_fit(days: list[date]) -> _Fit | None:
    fits = [f for c in CADENCES if (f := _fit(days, c)) is not None]
    if not fits:
        return None
    return min(fits, key=lambda f: (f.missed + f.extras, f.deviation, f.cadence.days))


def _confidence(fit: _Fit, amounts: list[Decimal], expected: Decimal) -> Decimal:
    count = min(1.0, (len(fit.kept) - 1) / 5)
    regularity = 1 - fit.deviation / fit.cadence.tolerance
    spread = float((max(amounts) - min(amounts)) / expected) if expected else 1.0
    stability = max(0.0, 1 - spread / float(AMOUNT_TOLERANCE * 2))
    gaps = max(0.0, 1 - (fit.missed + fit.extras) / len(fit.kept))
    score = 0.35 * count + 0.3 * regularity + 0.2 * stability + 0.15 * gaps
    return Decimal(str(round(min(1.0, max(0.0, score)), 3)))


def _most_common[T](values: list[T]) -> T:
    return Counter(values).most_common(1)[0][0]


def _distinctive(members: list[Occurrence], group: list[Occurrence]) -> bool:
    low = min(abs(o.amount) for o in members) * (1 - AMOUNT_TOLERANCE)
    high = max(abs(o.amount) for o in members) * (1 + AMOUNT_TOLERANCE)
    first, last = members[0].day, members[-1].day
    similar = [o for o in group if low <= abs(o.amount) <= high and first <= o.day <= last]
    return len(members) >= len(similar) * MIN_DISTINCTIVENESS


def _series(cluster: list[Occurrence], group: list[Occurrence]) -> Series | None:
    fit = _best_fit(sorted({o.day for o in cluster}))
    if fit is None:
        return None
    kept_days = set(fit.kept)
    members = sorted((o for o in cluster if o.day in kept_days), key=lambda o: (o.day, o.id))
    if not _distinctive(members, group):
        return None
    recent = members[-3:]
    expected = Decimal(statistics.median(abs(o.amount) for o in recent)).quantize(Decimal("0.01"))
    anchor = anchor_day(fit.kept, fit.cadence)
    last_seen = fit.kept[-1]
    category = _most_common([(o.category_id, o.subcategory_id) for o in members[-6:]])
    return Series(
        match_key=members[0].match_key,
        direction="out" if members[0].amount < 0 else "in",
        kind=_most_common([o.kind for o in members]),
        cadence=fit.cadence,
        expected_amount=expected,
        last_seen=last_seen,
        next_expected=fit.cadence.next_after(last_seen, anchor),
        anchor_day=anchor,
        occurrence_ids=[o.id for o in members],
        occurrences=len(fit.kept),
        missed=fit.missed,
        extras=fit.extras,
        confidence=_confidence(fit, [abs(o.amount) for o in members], expected),
        category_id=category[0],
        subcategory_id=category[1],
        merchant_id=_most_common([o.merchant_id for o in members]),
    )


def detect(occurrences: list[Occurrence]) -> list[Series]:
    """Tutte le serie riconoscibili, anche quelle ormai finite (vedi `Series.is_active`)."""
    groups: dict[tuple[str, bool], list[Occurrence]] = defaultdict(list)
    for o in occurrences:
        if o.amount != 0:
            groups[(o.match_key, o.amount < 0)].append(o)
    found: list[Series] = []
    for _, items in sorted(groups.items()):
        for cluster in _amount_clusters(items):
            series = _series(cluster, items)
            if series is not None:
                found.append(series)
    return found


def anchor_day(days: list[date], cadence: Cadence) -> int | None:
    """Giorno del mese tipico per le cadenze a mesi (31 = fine mese): quello più vicino alle
    date recenti, contando anche a cavallo del mese (30, 1 e 2 → il 1°)."""
    if cadence.months is None or not days:
        return None
    recent = sorted(days)[-6:]
    if all(d.day == calendar.monthrange(d.year, d.month)[1] for d in recent):
        return 31

    def distance(anchor: int) -> int:
        return sum(
            min(abs((_on_day(_add_months(d, delta), anchor) - d).days) for delta in (-1, 0, 1))
            for d in recent
        )

    exact = Counter(d.day for d in recent)
    # A parità vince il giorno più frequente, poi quello dell'ultimo addebito.
    return min(range(1, 32), key=lambda a: (distance(a), -exact[a], abs(a - recent[-1].day)))
