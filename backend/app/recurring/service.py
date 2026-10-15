"""Ricorrenze nel database: aggiornamento dopo ogni classificazione, prossimi addebiti.

Ad ogni passaggio il rilevamento riparte da zero (`detection.detect`) e il risultato si
riconcilia con le righe salvate:
- **proposte** (`suggested`): rispecchiano il rilevamento; spariscono se la serie non c'è più;
- **confermate**: le tue scelte (nome, importo atteso, frequenza) non vengono toccate; ne fanno
  parte i movimenti con la stessa controparte, verso e importo entro la tolleranza;
- **rifiutate**: non vengono più proposte e non raccolgono movimenti;
- **terminate**: restano com'erano (movimenti e ultima data congelati); se la serie riprende
  dopo la fine, torna come nuova proposta.
"""

from __future__ import annotations

import calendar
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classification.text import match_text
from app.classification.transfers import normalize_iban
from app.models import Merchant, RecurringTransaction, Subcategory, Transaction
from app.models.enums import Direction, RecurringStatus, TransactionKind
from app.recurring.detection import (
    Cadence,
    Occurrence,
    Series,
    amount_matches,
    anchor_day,
    cadence_for,
    detect,
)
from app.services.dates import today_rome

ELIGIBLE_KINDS = (
    TransactionKind.EXPENSE,
    TransactionKind.FEE,
    TransactionKind.INCOME,
    TransactionKind.INVESTMENT_TRANSFER,
)
# Precedenza quando un movimento corrisponde a più ricorrenze.
_PRECEDENCE = {
    RecurringStatus.ENDED: 0,
    RecurringStatus.CONFIRMED: 1,
    RecurringStatus.SUGGESTED: 2,
}


def match_key_for(tx: Transaction) -> str:
    """Controparte di un movimento: merchant, poi IBAN, poi nome, poi descrizione."""
    if tx.merchant_id is not None:
        return f"m:{tx.merchant_id}"
    iban = normalize_iban(tx.counterparty_iban)
    if iban:
        return f"iban:{iban}"
    if tx.counterparty_name and tx.counterparty_name.strip():
        return f"cp:{match_text(tx.counterparty_name)}"
    return f"d:{match_text(tx.description_clean)[:120]}"


def cadence_of(row: RecurringTransaction) -> Cadence:
    return cadence_for(row.frequency, row.interval_days)


def monthly_equivalent(row: RecurringTransaction) -> Decimal:
    return (row.expected_amount * cadence_of(row).per_month).quantize(Decimal("0.01"))


def is_late(row: RecurringTransaction, today: date) -> bool:
    """L'addebito atteso non è arrivato entro la tolleranza."""
    if row.next_expected_date is None or row.status != RecurringStatus.CONFIRMED:
        return False
    return today > row.next_expected_date + timedelta(days=cadence_of(row).tolerance)


@dataclass
class RecurringRefresh:
    detected: int = 0
    created: int = 0
    removed: int = 0
    linked: int = 0
    changed_links: int = 0
    by_status: dict[str, int] = field(default_factory=dict)


@dataclass
class _Tx:
    tx: Transaction
    occurrence: Occurrence


def _load(session: Session) -> list[_Tx]:
    rows = session.scalars(
        select(Transaction).where(Transaction.kind.in_([k.value for k in ELIGIBLE_KINDS]))
    )
    return [
        _Tx(
            tx,
            Occurrence(
                id=tx.id,
                day=tx.booking_date,
                amount=tx.amount_eur,
                kind=tx.kind,
                match_key=match_key_for(tx),
                category_id=tx.category_id,
                subcategory_id=tx.subcategory_id,
                merchant_id=tx.merchant_id,
            ),
        )
        for tx in rows
    ]


def _series_name(session: Session, series: Series, sample: Transaction, *, shared_key: bool) -> str:
    if series.merchant_id is not None:
        merchant = session.get(Merchant, series.merchant_id)
        name = merchant.name if merchant else sample.description_clean
    elif sample.counterparty_name:
        name = sample.counterparty_name.strip().title()
    else:
        name = sample.description_clean.capitalize()
    if shared_key and series.subcategory_id is not None:
        # Più serie dalla stessa controparte (Apple: iCloud e Apple Music).
        sub = session.get(Subcategory, series.subcategory_id)
        if sub is not None:
            name = f"{name} · {sub.name}"
    return name[:200]


def _find_row(
    series: Series, rows: list[RecurringTransaction], used: set[int]
) -> RecurringTransaction | None:
    candidates = [
        r
        for r in rows
        if id(r) not in used
        and r.match_key == series.match_key
        and r.direction == series.direction
        and (
            amount_matches(series.expected_amount, r.expected_amount, r.amount_tolerance_pct)
            or amount_matches(r.expected_amount, series.expected_amount, Decimal(10))
        )
        # Una serie terminata che riprende torna come nuova proposta.
        and not (
            r.status == RecurringStatus.ENDED
            and r.last_seen_date is not None
            and series.last_seen > r.last_seen_date + timedelta(days=cadence_of(r).tolerance)
        )
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda r: (abs(r.expected_amount - series.expected_amount), r.id))


def _apply_series(row: RecurringTransaction, series: Series, name: str) -> None:
    """Dati del rilevamento su una proposta (le righe confermate tengono le tue scelte)."""
    row.name = name
    row.frequency = series.cadence.frequency.value
    row.interval_days = series.cadence.interval_days
    row.expected_amount = series.expected_amount
    row.amount_tolerance_pct = Decimal(10)


def refresh_recurring(session: Session, today: date | None = None) -> RecurringRefresh:
    """Rileva le serie e aggiorna `recurring_transactions` e `transactions.recurring_id`."""
    today = today or today_rome()
    result = RecurringRefresh()
    items = _load(session)
    by_id = {item.tx.id: item for item in items}
    rows = list(session.scalars(select(RecurringTransaction).order_by(RecurringTransaction.id)))

    all_series = detect([item.occurrence for item in items])
    result.detected = len(all_series)
    keys = Counter(s.match_key for s in all_series)

    # 1. Riconciliazione: ogni serie con la riga più vicina, altrimenti una nuova proposta.
    # (Le righe nuove non hanno ancora un id: si indicizzano per identità dell'oggetto.)
    used: set[int] = set()
    series_of: dict[int, Series] = {}
    for series in sorted(all_series, key=lambda s: (-s.occurrences, s.match_key)):
        row = _find_row(series, rows, used)
        if row is None:
            if not series.is_active(today):
                continue
            row = RecurringTransaction(
                match_key=series.match_key,
                direction=series.direction,
                kind=series.kind,
                status=RecurringStatus.SUGGESTED,
                expected_amount=series.expected_amount,
                frequency=series.cadence.frequency.value,
                name="",
            )
            session.add(row)
            rows.append(row)
            result.created += 1
        used.add(id(row))
        series_of[id(row)] = series
        if row.status == RecurringStatus.SUGGESTED:
            sample = by_id[series.occurrence_ids[-1]].tx
            name = _series_name(session, series, sample, shared_key=keys[row.match_key] > 1)
            _apply_series(row, series, name)
        if row.status != RecurringStatus.ENDED:
            row.confidence = series.confidence

    for row in list(rows):
        found = series_of.get(id(row))
        if row.status == RecurringStatus.SUGGESTED and (
            found is None or not found.is_active(today)
        ):
            session.delete(row)
            rows.remove(row)
            result.removed += 1
    session.flush()

    # 2. Quali movimenti appartengono a quale ricorrenza.
    claims: dict[int, tuple[int, Decimal, RecurringTransaction]] = {}

    def claim(tx_id: int, row: RecurringTransaction) -> None:
        rank = _PRECEDENCE[RecurringStatus(row.status)]
        distance = abs(abs(by_id[tx_id].tx.amount_eur) - row.expected_amount)
        current = claims.get(tx_id)
        if current is None or (rank, distance) < current[:2]:
            claims[tx_id] = (rank, distance, row)

    members_by_key: dict[tuple[str, str], list[_Tx]] = defaultdict(list)
    for item in items:
        direction = Direction.OUT if item.tx.amount_eur < 0 else Direction.IN
        members_by_key[(item.occurrence.match_key, direction.value)].append(item)

    for row in rows:
        if row.status == RecurringStatus.ENDED:
            for item in items:
                if item.tx.recurring_id == row.id:
                    claim(item.tx.id, row)
        elif row.status == RecurringStatus.CONFIRMED:
            for item in members_by_key[(row.match_key, row.direction)]:
                amount = item.tx.amount_eur
                if amount_matches(amount, row.expected_amount, row.amount_tolerance_pct):
                    claim(item.tx.id, row)
            if (found := series_of.get(id(row))) is not None:
                for tx_id in found.occurrence_ids:
                    claim(tx_id, row)
        elif row.status == RecurringStatus.SUGGESTED:
            for tx_id in series_of[id(row)].occurrence_ids:
                claim(tx_id, row)

    for item in items:
        claimed = claims.get(item.tx.id)
        target = claimed[2].id if claimed else None
        if item.tx.recurring_id != target:
            item.tx.recurring_id = target
            result.changed_links += 1
    # Movimenti diventati non idonei (es. ora trasferimento interno): via dalla ricorrenza.
    for tx in session.scalars(
        select(Transaction).where(
            Transaction.recurring_id.is_not(None),
            Transaction.kind.not_in([k.value for k in ELIGIBLE_KINDS]),
        )
    ):
        tx.recurring_id = None
        result.changed_links += 1
    result.linked = len(claims)

    # 3. Date, categoria e tipo dai movimenti della ricorrenza.
    members: dict[int, list[Transaction]] = defaultdict(list)
    for tx_id, (_, _, row) in claims.items():
        members[row.id].append(by_id[tx_id].tx)
    for row in rows:
        txs = sorted(members.get(row.id, []), key=lambda t: (t.booking_date, t.id))
        if txs:
            pair = Counter((t.category_id, t.subcategory_id) for t in txs[-6:]).most_common(1)[0][0]
            row.category_id, row.subcategory_id = pair
            row.kind = Counter(t.kind for t in txs).most_common(1)[0][0]
            row.merchant_id = Counter(t.merchant_id for t in txs).most_common(1)[0][0]
        if row.status == RecurringStatus.ENDED:
            continue
        if txs:
            cadence = cadence_of(row)
            row.last_seen_date = txs[-1].booking_date
            row.next_expected_date = cadence.next_after(
                row.last_seen_date, anchor_day([t.booking_date for t in txs], cadence)
            )
        else:
            row.last_seen_date = None
            row.next_expected_date = None

    session.flush()
    result.by_status = dict(Counter(r.status for r in rows))
    return result


# --- Prossimi addebiti -------------------------------------------------------------------------


@dataclass(frozen=True)
class Upcoming:
    row: RecurringTransaction
    day: date
    overdue: bool  # data attesa già passata, ma ancora entro la tolleranza


def upcoming(
    rows: list[RecurringTransaction], date_from: date, date_to: date, today: date
) -> list[Upcoming]:
    """Addebiti/accrediti attesi tra `date_from` e `date_to`. Le date passate da poco (entro la
    tolleranza) restano in elenco come "in ritardo" finché il movimento non arriva."""
    found: list[Upcoming] = []
    for row in rows:
        if row.next_expected_date is None:
            continue
        cadence = cadence_of(row)
        day = row.next_expected_date
        anchor = None
        if cadence.months is not None:
            month_end = calendar.monthrange(day.year, day.month)[1]
            anchor = 31 if day.day == month_end else day.day
        grace = timedelta(days=cadence.tolerance)
        while day <= date_to:
            if day >= date_from and day + grace >= today:
                found.append(Upcoming(row, day, overdue=day < today))
            day = cadence.next_after(day, anchor)
    return sorted(found, key=lambda u: (u.day, u.row.name, u.row.id))
