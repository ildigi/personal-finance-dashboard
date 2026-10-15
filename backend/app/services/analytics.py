"""Calcoli di spese ed entrate (SPEC §11 "Analisi", §12).

Definizioni:
- **spese reali** = spese + commissioni − rimborsi, escluse le categorie con
  `excluded_from_spending` (Investimenti). I trasferimenti interni e i versamenti al
  broker non sono mai spese;
- **spostati e investiti** = versamenti netti verso il broker (`investment_transfer`);
- **entrate** = movimenti `income` (i rimborsi collegati riducono le spese, non contano qui);
- i movimenti senza categoria formano la voce "Da classificare" (`category_id` nullo),
  separata dalla categoria "Altro".
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import ColumnElement, and_, func, select
from sqlalchemy.orm import Session

from app.models import (
    Category,
    Dividend,
    IncomeClassification,
    Merchant,
    RecurringTransaction,
    Subcategory,
    Transaction,
)
from app.models.enums import Direction, RecurringStatus, TransactionKind
from app.recurring.service import monthly_equivalent
from app.schemas.analytics import (
    Averages,
    CategoryTotal,
    ExpensesSummary,
    IncomeSummary,
    IncomeTypeTotal,
    MerchantTotal,
    MonthCategory,
    MonthlySeries,
    MonthPoint,
    Period,
    SubcategoryTotal,
)

ZERO = Decimal("0.00")
SPENDING_KINDS = (TransactionKind.EXPENSE, TransactionKind.FEE, TransactionKind.REFUND)
UNCATEGORIZED_LABEL = "Da classificare"
SUBSCRIPTIONS_CODE = "abbonamenti"


# --- Espressioni riutilizzabili ---------------------------------------------------------------


def spending_condition() -> ColumnElement[bool]:
    """Movimenti che contano nelle spese reali. Richiede il join (esterno) con Category."""
    return and_(
        Transaction.kind.in_([k.value for k in SPENDING_KINDS]),
        Category.excluded_from_spending.is_not(True),
    )


def spending_amount() -> ColumnElement[Decimal]:
    """Contributo alle spese: positivo per le uscite, negativo per i rimborsi."""
    return -Transaction.amount_eur


def _spending_base() -> Any:
    return (
        select()
        .select_from(Transaction)
        .outerjoin(Category, Category.id == Transaction.category_id)
    )


# --- Periodi ----------------------------------------------------------------------------------


def shift_months(day: date, months: int, *, end_of_month: bool = False) -> date:
    month_index = day.year * 12 + (day.month - 1) + months
    year, month = divmod(month_index, 12)
    last = calendar.monthrange(year, month + 1)[1]
    return date(year, month + 1, last if end_of_month else min(day.day, last))


def _months_spanned(date_from: date, date_to: date) -> int:
    return (date_to.year - date_from.year) * 12 + date_to.month - date_from.month + 1


def previous_period(date_from: date, date_to: date, today: date) -> Period:
    """Stesso intervallo spostato indietro di tanti mesi quanti ne copre, fino allo stesso giorno
    (confronto equo: il 5 del mese si confronta con i primi 5 giorni del mese prima)."""
    months = _months_spanned(date_from, date_to)
    effective_to = min(date_to, today) if date_from <= today else date_to
    is_month_end = effective_to.day == calendar.monthrange(effective_to.year, effective_to.month)[1]
    return Period(
        date_from=shift_months(date_from, -months),
        date_to=shift_months(effective_to, -months, end_of_month=is_month_end),
    )


def _month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def _month_starts(end: date, count: int) -> list[date]:
    first = end.replace(day=1)
    return [shift_months(first, -i) for i in range(count - 1, -1, -1)]


# --- Totali -----------------------------------------------------------------------------------


def _spending_total(session: Session, date_from: date, date_to: date) -> tuple[Decimal, int]:
    row = session.execute(
        _spending_base()
        .add_columns(func.coalesce(func.sum(spending_amount()), 0), func.count(Transaction.id))
        .where(spending_condition(), Transaction.booking_date.between(date_from, date_to))
    ).one()
    return Decimal(row[0]), int(row[1])


def _invested_total(session: Session, date_from: date, date_to: date) -> Decimal:
    value = session.scalar(
        select(func.coalesce(func.sum(-Transaction.amount_eur), 0)).where(
            Transaction.kind == TransactionKind.INVESTMENT_TRANSFER,
            Transaction.booking_date.between(date_from, date_to),
        )
    )
    return Decimal(value or 0)


def _income_total(session: Session, date_from: date, date_to: date) -> tuple[Decimal, int]:
    row = session.execute(
        select(
            func.coalesce(func.sum(Transaction.amount_eur), 0), func.count(Transaction.id)
        ).where(
            Transaction.kind == TransactionKind.INCOME,
            Transaction.booking_date.between(date_from, date_to),
        )
    ).one()
    return Decimal(row[0]), int(row[1])


def _first_data_month(session: Session) -> date | None:
    first = session.scalar(select(func.min(Transaction.booking_date)))
    return first.replace(day=1) if first else None


def _monthly_averages(session: Session, today: date, monthly: dict[str, Decimal]) -> Averages:
    """Medie sui mesi interi prima del mese corrente, ignorando quelli senza ancora dati."""
    first = _first_data_month(session)
    current = today.replace(day=1)

    def average(n: int) -> Decimal | None:
        months = [m for m in _month_starts(shift_months(current, -1), n) if first and m >= first]
        if not months:
            return None
        total = sum((monthly.get(_month_key(m), ZERO) for m in months), ZERO)
        return (total / len(months)).quantize(Decimal("0.01"))

    return Averages(m3=average(3), m6=average(6), m12=average(12))


def _monthly_spending(
    session: Session, date_from: date, date_to: date, *, category_code: str | None = None
) -> dict[str, Decimal]:
    month = func.to_char(Transaction.booking_date, "YYYY-MM")
    query = (
        _spending_base()
        .add_columns(month, func.sum(spending_amount()))
        .where(spending_condition(), Transaction.booking_date.between(date_from, date_to))
        .group_by(month)
    )
    if category_code is not None:
        query = query.where(Category.code == category_code)
    return {key: Decimal(total) for key, total in session.execute(query)}


def _monthly_income(session: Session, date_from: date, date_to: date) -> dict[str, Decimal]:
    month = func.to_char(Transaction.booking_date, "YYYY-MM")
    rows = session.execute(
        select(month, func.sum(Transaction.amount_eur))
        .where(
            Transaction.kind == TransactionKind.INCOME,
            Transaction.booking_date.between(date_from, date_to),
        )
        .group_by(month)
    )
    return {key: Decimal(total) for key, total in rows}


def _pct(current: Decimal, previous: Decimal) -> float | None:
    if previous == 0:
        return None
    return round(float((current - previous) / abs(previous) * 100), 1)


# --- Spese ------------------------------------------------------------------------------------


def _by_category(
    session: Session, date_from: date, date_to: date
) -> dict[tuple[int | None, int | None], tuple[Decimal, int]]:
    category = Transaction.category_id
    rows = session.execute(
        _spending_base()
        .add_columns(
            category,
            Transaction.subcategory_id,
            func.sum(spending_amount()),
            func.count(Transaction.id),
        )
        .where(spending_condition(), Transaction.booking_date.between(date_from, date_to))
        .group_by(category, Transaction.subcategory_id)
    )
    return {(cat, sub): (Decimal(total), int(n)) for cat, sub, total, n in rows}


def _subscriptions_monthly(session: Session) -> Decimal | None:
    """Equivalente mensile degli abbonamenti confermati tra le ricorrenze (None se nessuno)."""
    rows = session.scalars(
        select(RecurringTransaction)
        .join(Category, Category.id == RecurringTransaction.category_id)
        .where(
            RecurringTransaction.status == RecurringStatus.CONFIRMED,
            RecurringTransaction.direction == Direction.OUT,
            Category.code == SUBSCRIPTIONS_CODE,
        )
    ).all()
    if not rows:
        return None
    return sum((monthly_equivalent(r) for r in rows), ZERO)


def expenses_summary(
    session: Session, date_from: date, date_to: date, today: date
) -> ExpensesSummary:
    previous = previous_period(date_from, date_to, today)
    total, count = _spending_total(session, date_from, date_to)
    previous_total, _ = _spending_total(session, previous.date_from, previous.date_to)

    history_from = shift_months(today.replace(day=1), -12)
    history_to = today.replace(day=1) - timedelta(days=1)
    averages = _monthly_averages(
        session, today, _monthly_spending(session, history_from, history_to)
    )
    subscriptions = _subscriptions_monthly(session)
    subscriptions_source: Literal["recurring", "average"] = "recurring"
    if subscriptions is None:
        subscriptions_source = "average"
        subscriptions = _monthly_averages(
            session,
            today,
            _monthly_spending(session, history_from, history_to, category_code=SUBSCRIPTIONS_CODE),
        ).m3

    current_rows = _by_category(session, date_from, date_to)
    previous_rows = _by_category(session, previous.date_from, previous.date_to)
    categories = {c.id: c for c in session.scalars(select(Category))}
    subcategories = {s.id: s for s in session.scalars(select(Subcategory))}

    totals: dict[int | None, list[Any]] = {}
    for (cat_id, sub_id), (amount, n) in current_rows.items():
        entry = totals.setdefault(cat_id, [ZERO, 0, {}])
        entry[0] += amount
        entry[1] += n
        entry[2][sub_id] = (amount, n)
    previous_by_cat: dict[int | None, Decimal] = defaultdict(lambda: ZERO)
    for (cat_id, _), (amount, _n) in previous_rows.items():
        previous_by_cat[cat_id] += amount
        totals.setdefault(cat_id, [ZERO, 0, {}])

    items: list[CategoryTotal] = []
    for cat_id, (amount, n, subs) in totals.items():
        category = categories.get(cat_id) if cat_id is not None else None
        sub_items = [
            SubcategoryTotal(
                subcategory_id=sub_id,
                name=subcategories[sub_id].name
                if sub_id in subcategories
                else "Senza sottocategoria",
                total_eur=sub_amount,
                count=sub_n,
            )
            for sub_id, (sub_amount, sub_n) in subs.items()
        ]
        sub_items.sort(key=lambda s: (s.subcategory_id is None, -s.total_eur))
        items.append(
            CategoryTotal(
                category_id=cat_id,
                name=category.name if category else UNCATEGORIZED_LABEL,
                icon=category.icon if category else None,
                color=category.color if category else None,
                total_eur=amount,
                previous_eur=previous_by_cat[cat_id],
                count=n,
                share_pct=round(float(amount / total * 100), 1) if total > 0 else 0.0,
                subcategories=sub_items if any(s.subcategory_id for s in sub_items) else [],
            )
        )
    items.sort(key=lambda c: (-c.total_eur, -c.previous_eur, c.name))

    unclassified = session.scalar(
        select(func.count(Transaction.id)).where(
            Transaction.classification_source == "none",
            Transaction.booking_date.between(date_from, date_to),
        )
    )
    return ExpensesSummary(
        period=Period(date_from=date_from, date_to=date_to),
        previous_period=previous,
        total_eur=total,
        previous_total_eur=previous_total,
        delta_eur=total - previous_total,
        delta_pct=_pct(total, previous_total),
        count=count,
        invested_eur=_invested_total(session, date_from, date_to),
        previous_invested_eur=_invested_total(session, previous.date_from, previous.date_to),
        averages=averages,
        subscriptions_monthly_eur=subscriptions,
        subscriptions_source=subscriptions_source,
        unclassified_count=unclassified or 0,
        categories=items,
    )


def monthly_series(session: Session, end: date, months: int) -> MonthlySeries:
    starts = _month_starts(end, months)
    date_from = starts[0]
    date_to = shift_months(end, 0, end_of_month=True)
    month = func.to_char(Transaction.booking_date, "YYYY-MM")
    category = Transaction.category_id

    by_month_cat: dict[str, dict[int | None, Decimal]] = defaultdict(dict)
    for key, cat_id, total in session.execute(
        _spending_base()
        .add_columns(month, category, func.sum(spending_amount()))
        .where(spending_condition(), Transaction.booking_date.between(date_from, date_to))
        .group_by(month, category)
    ):
        by_month_cat[key][cat_id] = Decimal(total)

    income = _monthly_income(session, date_from, date_to)
    invested = {
        key: Decimal(total)
        for key, total in session.execute(
            select(month, func.sum(-Transaction.amount_eur))
            .where(
                Transaction.kind == TransactionKind.INVESTMENT_TRANSFER,
                Transaction.booking_date.between(date_from, date_to),
            )
            .group_by(month)
        )
    }

    points = []
    for start in starts:
        key = _month_key(start)
        cats = by_month_cat.get(key, {})
        expenses = sum(cats.values(), ZERO)
        month_income = income.get(key, ZERO)
        points.append(
            MonthPoint(
                month=key,
                expenses_eur=expenses,
                income_eur=month_income,
                invested_eur=invested.get(key, ZERO),
                net_eur=month_income - expenses,
                categories=[
                    MonthCategory(category_id=c, total_eur=v)
                    for c, v in sorted(cats.items(), key=lambda item: -item[1])
                ],
            )
        )
    return MonthlySeries(months=points)


def merchants_ranking(
    session: Session, date_from: date, date_to: date, limit: int
) -> list[MerchantTotal]:
    total = func.sum(spending_amount())
    rows = session.execute(
        _spending_base()
        .join(Merchant, Merchant.id == Transaction.merchant_id)
        .add_columns(
            Merchant.id,
            Merchant.name,
            total,
            func.count(Transaction.id),
            func.max(Transaction.booking_date),
            Merchant.default_category_id,
            func.mode().within_group(Transaction.category_id),
        )
        .where(spending_condition(), Transaction.booking_date.between(date_from, date_to))
        .group_by(Merchant.id)
        .having(total > 0)
        .order_by(total.desc(), Merchant.name)
        .limit(limit)
    )
    return [
        MerchantTotal(
            merchant_id=merchant_id,
            name=name,
            total_eur=Decimal(amount),
            count=n,
            average_eur=(Decimal(amount) / n).quantize(Decimal("0.01")),
            last_date=last,
            category_id=common_category or default_category,
        )
        for merchant_id, name, amount, n, last, default_category, common_category in rows
    ]


# --- Entrate ----------------------------------------------------------------------------------


def income_summary(session: Session, date_from: date, date_to: date, today: date) -> IncomeSummary:
    previous = previous_period(date_from, date_to, today)
    total, count = _income_total(session, date_from, date_to)
    previous_total, _ = _income_total(session, previous.date_from, previous.date_to)
    expenses, _ = _spending_total(session, date_from, date_to)

    history_from = shift_months(today.replace(day=1), -12)
    history_to = today.replace(day=1) - timedelta(days=1)
    averages = _monthly_averages(session, today, _monthly_income(session, history_from, history_to))

    rows = session.execute(
        select(
            IncomeClassification.id,
            IncomeClassification.code,
            IncomeClassification.label,
            func.sum(Transaction.amount_eur),
            func.count(Transaction.id),
        )
        .select_from(Transaction)
        .outerjoin(IncomeClassification, IncomeClassification.id == Transaction.income_type_id)
        .where(
            Transaction.kind == TransactionKind.INCOME,
            Transaction.booking_date.between(date_from, date_to),
        )
        .group_by(IncomeClassification.id)
        .order_by(func.sum(Transaction.amount_eur).desc())
    )
    by_type = [
        IncomeTypeTotal(
            income_type_id=type_id,
            code=code or "other",
            label=label or "Altro",
            total_eur=Decimal(amount),
            count=n,
        )
        for type_id, code, label, amount, n in rows
    ]

    dividends = session.scalar(
        select(func.coalesce(func.sum(Dividend.amount_eur), 0)).where(
            Dividend.paid_on.between(date_from, date_to)
        )
    )
    savings = total - expenses
    return IncomeSummary(
        period=Period(date_from=date_from, date_to=date_to),
        previous_period=previous,
        total_eur=total,
        previous_total_eur=previous_total,
        delta_pct=_pct(total, previous_total),
        count=count,
        expenses_eur=expenses,
        savings_eur=savings,
        savings_rate_pct=round(float(savings / total * 100), 1) if total > 0 else None,
        averages=averages,
        dividends_eur=Decimal(dividends or 0),
        by_type=by_type,
    )
