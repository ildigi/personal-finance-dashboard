"""Patrimonio netto: quanto hai oggi e com'è andato nel tempo (SPEC §16, Fase 9).

- **Oggi:** per ogni conto l'ultimo saldo (il disponibile se la banca lo dà, come in
  Panoramica); per il broker il valore del conto (liquidità + titoli) dell'ultima sync.
- **Storico delle banche:** ricostruito all'indietro dal saldo contabile più recente
  togliendo i movimenti contabilizzati. Prima del primo movimento noto il conto non ha
  dati (la banca dà solo una parte dello storico): quei giorni sono *parziali*.
- **Storico del broker:** il valore giornaliero salvato a ogni sync. Prima del primo
  salvataggio si usa il capitale versato fino a quel giorno: è una *stima* (senza le
  variazioni di mercato).
- **Foto giornaliera** (`net_worth_snapshots`): dopo ogni sincronizzazione si salva il
  patrimonio del giorno; per i giorni con la foto valgono i valori salvati.
"""

from __future__ import annotations

import logging
from bisect import bisect_right
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classification.paypal import funded_purchase_ids
from app.models import (
    Account,
    Balance,
    InvestmentCashFlow,
    NetWorthSnapshot,
    Portfolio,
    Transaction,
)
from app.models.enums import AccountType, CashFlowType, TransactionStatus
from app.schemas.networth import (
    NetWorthAccount,
    NetWorthChange,
    NetWorthKind,
    NetWorthOverview,
    NetWorthPoint,
)
from app.services.fx import FxRateMissingError, to_eur

log = logging.getLogger(__name__)

ZERO = Decimal("0.00")
CHANGE_DAYS = (30, 90, 365)


def _kind(account: Account) -> NetWorthKind:
    return "investments" if account.type == AccountType.BROKER else "cash"


@dataclass
class _History:
    """Valori giornalieri di un conto, in EUR."""

    account: Account
    #: Primo giorno con un valore reale (prima: niente dati, o stima per il broker).
    real_from: date | None = None
    # Banche: saldo di riferimento e somme dei movimenti per giorno.
    anchor_day: date | None = None
    anchor_eur: Decimal = ZERO
    days: list[date] = field(default_factory=list)
    cumulative: list[Decimal] = field(default_factory=list)
    # Broker: valori salvati per giorno e capitale versato cumulato.
    saved_days: list[date] = field(default_factory=list)
    saved_values: list[Decimal] = field(default_factory=list)
    flow_days: list[date] = field(default_factory=list)
    flow_cumulative: list[Decimal] = field(default_factory=list)

    def _sum_until(self, day: date) -> Decimal:
        i = bisect_right(self.days, day)
        return self.cumulative[i - 1] if i else ZERO

    def value(self, day: date) -> tuple[Decimal | None, bool]:
        """(valore, stimato). None = nessun dato per quel giorno."""
        if _kind(self.account) == "investments":
            i = bisect_right(self.saved_days, day)
            if i:
                return self.saved_values[i - 1], False
            j = bisect_right(self.flow_days, day)
            if not self.flow_days:
                return None, False
            return (self.flow_cumulative[j - 1] if j else ZERO), True
        if self.anchor_day is None or self.real_from is None or day < self.real_from:
            return None, False
        return self.anchor_eur + self._sum_until(day) - self._sum_until(self.anchor_day), False


def _eur(session: Session, amount: Decimal, currency: str, day: date) -> Decimal | None:
    try:
        return to_eur(session, amount, currency, day)
    except FxRateMissingError:
        return None


def _accounts(session: Session) -> list[Account]:
    return list(
        session.scalars(
            select(Account)
            .where(Account.is_active.is_(True), Account.include_in_net_worth.is_(True))
            .order_by(Account.institution, Account.name)
        )
    )


def _balances(session: Session, account_ids: list[int]) -> dict[int, list[Balance]]:
    rows: dict[int, list[Balance]] = defaultdict(list)
    for b in session.scalars(
        select(Balance)
        .where(Balance.account_id.in_(account_ids))
        .order_by(Balance.as_of, Balance.id)
    ):
        rows[b.account_id].append(b)
    return rows


def _current(account: Account, balances: list[Balance]) -> Balance | None:
    """Ultimo saldo: il disponibile se c'è (comprende i pagamenti in sospeso), altrimenti
    il contabile. Stessa scelta di `/api/accounts`."""
    for kind in ("available", "booked"):
        rows = [b for b in balances if b.balance_type == kind]
        if rows:
            return max(rows, key=lambda b: (b.as_of, b.id))
    return None


def _bank_history(
    session: Session, account: Account, balances: list[Balance], skip: set[int]
) -> _History:
    h = _History(account=account)
    booked = [b for b in balances if b.balance_type == "booked"]
    anchor = max(booked or balances, key=lambda b: (b.as_of, b.id), default=None)
    if anchor is None:
        return h
    anchor_eur = _eur(session, anchor.balance, anchor.currency, anchor.as_of)
    if anchor_eur is None:
        return h
    per_day: dict[date, Decimal] = defaultdict(lambda: ZERO)
    for tx_id, day, amount in session.execute(
        select(Transaction.id, Transaction.booking_date, Transaction.amount_eur).where(
            Transaction.account_id == account.id,
            Transaction.status == TransactionStatus.BOOKED.value,
        )
    ):
        if tx_id not in skip:
            per_day[day] += amount
    running = ZERO
    for day in sorted(per_day):
        running += per_day[day]
        h.days.append(day)
        h.cumulative.append(running)
    h.anchor_day, h.anchor_eur = anchor.as_of, anchor_eur
    h.real_from = min(h.days[0], anchor.as_of) if h.days else anchor.as_of
    return h


def _broker_history(session: Session, account: Account, balances: list[Balance]) -> _History:
    h = _History(account=account)
    for b in balances:
        if b.balance_type != "booked":
            continue
        value = _eur(session, b.balance, b.currency, b.as_of)
        if value is None:
            continue
        if h.saved_days and h.saved_days[-1] == b.as_of:
            h.saved_values[-1] = value
        else:
            h.saved_days.append(b.as_of)
            h.saved_values.append(value)
    h.real_from = h.saved_days[0] if h.saved_days else None

    portfolio_ids = list(
        session.scalars(select(Portfolio.id).where(Portfolio.account_id == account.id))
    )
    per_day: dict[date, Decimal] = defaultdict(lambda: ZERO)
    for flow in session.scalars(
        select(InvestmentCashFlow).where(
            InvestmentCashFlow.portfolio_id.in_(portfolio_ids),
            InvestmentCashFlow.type.in_(
                [CashFlowType.DEPOSIT.value, CashFlowType.WITHDRAWAL.value]
            ),
        )
    ):
        sign = 1 if flow.type == CashFlowType.DEPOSIT else -1
        per_day[flow.occurred_at.date()] += sign * flow.amount_eur
    running = ZERO
    for day in sorted(per_day):
        running += per_day[day]
        h.flow_days.append(day)
        h.flow_cumulative.append(running)
    return h


def _snapshots(session: Session, start: date, end: date) -> dict[date, dict[int, Decimal]]:
    result: dict[date, dict[int, Decimal]] = {}
    for snap in session.scalars(
        select(NetWorthSnapshot).where(
            NetWorthSnapshot.snapshot_date >= start, NetWorthSnapshot.snapshot_date <= end
        )
    ):
        values: dict[int, Decimal] = {}
        for key, value in (snap.breakdown or {}).items():
            try:
                values[int(key)] = Decimal(str(value))
            except (ValueError, ArithmeticError):
                continue
        result[snap.snapshot_date] = values
    return result


@dataclass
class _Today:
    values: dict[int, tuple[Decimal | None, date | None]]
    cash: Decimal
    investments: Decimal


def _today_values(
    session: Session, accounts: list[Account], balances: dict[int, list[Balance]]
) -> _Today:
    values: dict[int, tuple[Decimal | None, date | None]] = {}
    cash = investments = ZERO
    for account in accounts:
        rows = balances.get(account.id, [])
        if _kind(account) == "investments":
            booked = [b for b in rows if b.balance_type == "booked"]
            latest = max(booked, key=lambda b: (b.as_of, b.id), default=None)
        else:
            latest = _current(account, rows)
        value = _eur(session, latest.balance, latest.currency, latest.as_of) if latest else None
        values[account.id] = (value, latest.as_of if latest else None)
        if value is None:
            continue
        if _kind(account) == "investments":
            investments += value
        else:
            cash += value
    return _Today(values=values, cash=cash, investments=investments)


def record_snapshot(session: Session, today: date) -> NetWorthSnapshot | None:
    """Salva (o aggiorna) la foto del patrimonio di oggi. Non fa commit."""
    accounts = _accounts(session)
    if not accounts:
        return None
    current = _today_values(session, accounts, _balances(session, [a.id for a in accounts]))
    breakdown = {str(a): str(v) for a, (v, _) in current.values.items() if v is not None}
    snap = session.scalar(select(NetWorthSnapshot).where(NetWorthSnapshot.snapshot_date == today))
    if snap is None:
        snap = NetWorthSnapshot(snapshot_date=today)
        session.add(snap)
    snap.cash_total_eur = current.cash
    snap.investments_total_eur = current.investments
    snap.net_worth_eur = current.cash + current.investments
    snap.breakdown = breakdown
    session.flush()
    return snap


def _pct(part: Decimal, whole: Decimal) -> float | None:
    return round(float(part / whole * 100), 1) if whole > 0 else None


def net_worth_overview(session: Session, today: date, since: date | None) -> NetWorthOverview:
    accounts = _accounts(session)
    balances = _balances(session, [a.id for a in accounts])
    current = _today_values(session, accounts, balances)
    # Pagamenti PayPal coperti da una carta: il saldo PayPal non cambia.
    funded = funded_purchase_ids(session)
    histories = {
        a.id: (
            _broker_history(session, a, balances.get(a.id, []))
            if _kind(a) == "investments"
            else _bank_history(session, a, balances.get(a.id, []), funded)
        )
        for a in accounts
    }

    starts = [
        d
        for h in histories.values()
        for d in (h.real_from, h.flow_days[0] if h.flow_days else None)
        if d is not None
    ]
    first = min(starts, default=today)
    start = max(since, first) if since is not None else first
    start = min(start, today)
    saved = _snapshots(session, start, today)

    series: list[NetWorthPoint] = []
    day = start
    while day <= today:
        cash = investments = ZERO
        partial = estimated = False
        for account in accounts:
            if day == today:
                value, is_estimate = current.values[account.id][0], False
            elif account.id in saved.get(day, {}):
                value, is_estimate = saved[day][account.id], False
            else:
                value, is_estimate = histories[account.id].value(day)
            if value is None:
                # Il broker prima del primo versamento non esisteva ancora: non manca nulla.
                partial = partial or _kind(account) == "cash"
                continue
            estimated = estimated or is_estimate
            if _kind(account) == "investments":
                investments += value
            else:
                cash += value
        series.append(
            NetWorthPoint(
                date=day,
                cash_eur=cash,
                investments_eur=investments,
                total_eur=cash + investments,
                partial=partial,
                estimated=estimated,
            )
        )
        day += timedelta(days=1)

    total = current.cash + current.investments
    positive = sum((v for v, _ in current.values.values() if v is not None and v > 0), ZERO)
    rows = [
        NetWorthAccount(
            account_id=a.id,
            name=a.name,
            institution=a.institution,
            type=a.type,
            kind=_kind(a),
            currency=a.currency,
            value_eur=current.values[a.id][0],
            as_of=current.values[a.id][1],
            share_pct=_pct(v, positive)
            if (v := current.values[a.id][0]) is not None and v > 0
            else None,
            history_from=histories[a.id].real_from,
        )
        for a in accounts
    ]

    by_day = {p.date: p for p in series}
    changes = []
    for days in CHANGE_DAYS:
        then = today - timedelta(days=days)
        point = by_day.get(then)
        if point is None:
            continue
        reliable = not (point.partial or point.estimated)
        delta = total - point.total_eur if reliable else None
        changes.append(
            NetWorthChange(
                days=days,
                from_date=then,
                delta_eur=delta,
                delta_pct=_pct(delta, point.total_eur)
                if delta is not None and point.total_eur > 0
                else None,
                cash_delta_eur=None if point.partial else current.cash - point.cash_eur,
            )
        )

    reals = [h.real_from for h in histories.values()]
    known = [r for r in reals if r is not None]
    complete_from = max(known) if known and len(known) == len(reals) else None
    return NetWorthOverview(
        as_of=today,
        total_eur=total,
        cash_eur=current.cash,
        investments_eur=current.investments,
        accounts=rows,
        series=series,
        changes=changes,
        complete_from=complete_from,
    )
