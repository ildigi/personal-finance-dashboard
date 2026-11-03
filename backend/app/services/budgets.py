"""Budget mensili per categoria o sottocategoria (SPEC §11 "Budget", RF-7).

- **Speso** = spese reali del mese nella categoria (o sottocategoria), come nella pagina Spese:
  i rimborsi riducono, trasferimenti e investimenti non contano.
- **Proiezione a fine mese** = speso + addebiti ricorrenti confermati ancora attesi nel mese
  + spesa variabile per i giorni che restano. Il ritmo della spesa variabile mescola quello
  del mese in corso e la media degli ultimi 3 mesi, pesando di più il mese man mano che avanza
  (il 2 del mese un solo caffè non fa tendenza).
- **Avvisi**: `warning` dalla soglia (default 80%), `over` dal 100%.
- **Versioni**: cambiare l'importo chiude il budget alla fine del mese scorso e ne apre uno
  nuovo dal mese corrente, così lo storico si confronta col budget di allora.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import case, false, func, select
from sqlalchemy.orm import Session

from app.core.messages import AppError
from app.models import Budget, Category, RecurringTransaction, Subcategory, Transaction
from app.models.enums import CategoryKind, Direction, RecurringStatus
from app.recurring.service import upcoming
from app.schemas.planning import (
    BudgetCreate,
    BudgetMonth,
    BudgetOverview,
    BudgetStatus,
    BudgetSuggestion,
    BudgetUpdate,
)
from app.services.analytics import (
    ZERO,
    shift_months,
    spending_amount,
    spending_condition,
)

HISTORY_MONTHS = 6
CENT = Decimal("0.01")

Scope = tuple[int, int | None]  # (categoria, sottocategoria o None = tutta la categoria)


class BudgetError(AppError, ValueError):
    """Richiesta non valida (422)."""


class BudgetConflictError(AppError, ValueError):
    """Esiste già un budget aperto per la stessa categoria (409)."""


# --- Mesi -----------------------------------------------------------------------------------------


def month_bounds(day: date) -> tuple[date, date]:
    start = day.replace(day=1)
    return start, start.replace(day=calendar.monthrange(start.year, start.month)[1])


def month_key(day: date) -> str:
    return f"{day.year:04d}-{day.month:02d}"


def parse_month(value: str) -> date:
    year, month = value.split("-")
    return date(int(year), int(month), 1)


def _valid_in(budget: Budget, start: date, end: date) -> bool:
    return budget.valid_from <= end and (budget.valid_to is None or budget.valid_to >= start)


def _scope(budget: Budget) -> Scope:
    return (budget.category_id, budget.subcategory_id)


# --- Spesa per mese e categoria -------------------------------------------------------------------


@dataclass
class _Cell:
    total: Decimal = ZERO
    recurring: Decimal = ZERO  # parte dovuta a ricorrenze confermate


class _Spending:
    """Spese reali per (mese, categoria, sottocategoria), separando le ricorrenze confermate."""

    def __init__(self, session: Session, date_from: date, date_to: date, confirmed: list[int]):
        month = func.to_char(Transaction.booking_date, "YYYY-MM")
        is_recurring = Transaction.recurring_id.in_(confirmed) if confirmed else false()
        rows = session.execute(
            select(
                month,
                Transaction.category_id,
                Transaction.subcategory_id,
                func.sum(spending_amount()),
                func.coalesce(func.sum(case((is_recurring, spending_amount()))), 0),
            )
            .select_from(Transaction)
            .outerjoin(Category, Category.id == Transaction.category_id)
            .where(
                spending_condition(),
                Transaction.category_id.is_not(None),
                Transaction.booking_date.between(date_from, date_to),
            )
            .group_by(month, Transaction.category_id, Transaction.subcategory_id)
        )
        self.cells: dict[tuple[str, int, int | None], _Cell] = {
            (key, cat, sub): _Cell(Decimal(total), Decimal(rec))
            for key, cat, sub, total, rec in rows
        }

    def get(self, month: str, scope: Scope) -> _Cell:
        category, subcategory = scope
        cell = _Cell()
        for (key, cat, sub), value in self.cells.items():
            if key == month and cat == category and (subcategory is None or sub == subcategory):
                cell.total += value.total
                cell.recurring += value.recurring
        return cell


def _first_data_month(session: Session) -> date | None:
    first = session.scalar(select(func.min(Transaction.booking_date)))
    return first.replace(day=1) if first else None


def _confirmed_rows(session: Session) -> list[RecurringTransaction]:
    return list(
        session.scalars(
            select(RecurringTransaction).where(
                RecurringTransaction.status == RecurringStatus.CONFIRMED
            )
        )
    )


def _in_scope(row: RecurringTransaction, scope: Scope) -> bool:
    category, subcategory = scope
    return row.category_id == category and (
        subcategory is None or row.subcategory_id == subcategory
    )


# --- Stato dei budget -----------------------------------------------------------------------------


def _level(used_pct: float, threshold: int) -> str:
    if used_pct >= 100:
        return "over"
    if used_pct >= threshold:
        return "warning"
    return "ok"


def _pct(part: Decimal, whole: Decimal) -> float:
    return round(float(part / whole * 100), 1) if whole > 0 else 0.0


def budget_overview(session: Session, month: date, today: date) -> BudgetOverview:
    start, end = month_bounds(month)
    current_start, _ = month_bounds(today)
    if start > current_start:
        raise BudgetError("budget.month_not_started")
    is_current = start == current_start
    days_in_month = end.day
    elapsed = today.day if is_current else days_in_month

    budgets = list(session.scalars(select(Budget).order_by(Budget.valid_from, Budget.id)))
    active = [b for b in budgets if _valid_in(b, start, end)]
    history_starts = [shift_months(start, -i) for i in range(HISTORY_MONTHS - 1, -1, -1)]
    confirmed = _confirmed_rows(session)
    spending = _Spending(session, history_starts[0], end, [r.id for r in confirmed])
    first_month = _first_data_month(session)
    expected_rows = [r for r in confirmed if r.direction == Direction.OUT] if is_current else []
    expected = upcoming(expected_rows, today + timedelta(days=1), end, today) if is_current else []
    categories = {c.id: c for c in session.scalars(select(Category))}
    subcategories = {s.id: s for s in session.scalars(select(Subcategory))}

    items: list[BudgetStatus] = []
    for budget in active:
        scope = _scope(budget)
        cell = spending.get(month_key(start), scope)
        spent = cell.total.quantize(CENT)
        recurring_left = sum(
            (u.row.expected_amount for u in expected if _in_scope(u.row, scope)), ZERO
        )
        projected = spent
        if is_current:
            projected = _project(
                spent=spent,
                recurring_spent=cell.recurring,
                recurring_left=recurring_left,
                history=[
                    spending.get(month_key(m), scope)
                    for m in history_starts[-4:-1]
                    if first_month is None or m >= first_month
                ],
                elapsed=elapsed,
                days_in_month=days_in_month,
            )
        history = [
            BudgetMonth(
                month=month_key(m),
                amount=next(
                    (
                        b.amount
                        for b in budgets
                        if _scope(b) == scope and _valid_in(b, *month_bounds(m))
                    ),
                    None,
                ),
                spent_eur=spending.get(month_key(m), scope).total.quantize(CENT),
            )
            for m in history_starts
        ]
        category = categories[budget.category_id]
        sub = subcategories.get(budget.subcategory_id) if budget.subcategory_id else None
        used_pct = _pct(spent, budget.amount)
        level = _level(used_pct, budget.alert_threshold_pct)
        items.append(
            BudgetStatus(
                id=budget.id,
                category_id=budget.category_id,
                subcategory_id=budget.subcategory_id,
                name=f"{category.name} › {sub.name}" if sub else category.name,
                icon=category.icon,
                color=category.color,
                amount=budget.amount,
                alert_threshold_pct=budget.alert_threshold_pct,
                valid_from=budget.valid_from,
                spent_eur=spent,
                remaining_eur=budget.amount - spent,
                used_pct=used_pct,
                projected_eur=projected,
                projected_pct=_pct(projected, budget.amount),
                recurring_expected_eur=recurring_left,
                level=level,  # type: ignore[arg-type]
                projected_over=level != "over" and projected > budget.amount,
                history=history,
            )
        )

    # Più a rischio in alto; a parità, l'ordine delle categorie.
    rank = {"over": 0, "warning": 1, "ok": 2}
    items.sort(
        key=lambda i: (
            rank[i.level],
            not i.projected_over,
            categories[i.category_id].sort_order or 0,
            i.name,
        )
    )

    # Totali senza contare due volte una sottocategoria che ha anche il budget della categoria.
    whole_categories = {i.category_id for i in items if i.subcategory_id is None}
    counted = [
        i for i in items if i.subcategory_id is None or i.category_id not in whole_categories
    ]
    return BudgetOverview(
        month=month_key(start),
        date_from=start,
        date_to=end,
        is_current=is_current,
        days_elapsed=elapsed,
        days_in_month=days_in_month,
        total_amount=sum((i.amount for i in counted), ZERO),
        total_spent_eur=sum((i.spent_eur for i in counted), ZERO),
        total_projected_eur=sum((i.projected_eur for i in counted), ZERO),
        warning_count=sum(i.level == "warning" for i in items),
        over_count=sum(i.level == "over" for i in items),
        items=items,
    )


def _project(
    *,
    spent: Decimal,
    recurring_spent: Decimal,
    recurring_left: Decimal,
    history: list[_Cell],
    elapsed: int,
    days_in_month: int,
) -> Decimal:
    remaining_days = days_in_month - elapsed
    current_rate = (spent - recurring_spent) / elapsed
    rate = current_rate
    if history:
        # Mese "medio" degli ultimi 3: spesa variabile al giorno.
        past_rate = sum((c.total - c.recurring for c in history), ZERO) / (
            Decimal(len(history)) * Decimal("30.44")
        )
        weight = Decimal(elapsed) / Decimal(days_in_month)
        rate = weight * current_rate + (1 - weight) * past_rate
    projected = spent + recurring_left + max(rate, ZERO) * remaining_days
    return max(projected, spent).quantize(CENT)


def budget_status(session: Session, budget_id: int, today: date) -> BudgetStatus:
    overview = budget_overview(session, today, today)
    return next(i for i in overview.items if i.id == budget_id)


def suggestion(
    session: Session, category_id: int, subcategory_id: int | None, today: date
) -> BudgetSuggestion:
    start, end = month_bounds(today)
    months = [shift_months(start, -i) for i in range(6, 0, -1)]
    spending = _Spending(session, months[0], end, [])
    first = _first_data_month(session)
    scope = (category_id, subcategory_id)
    totals = [
        spending.get(month_key(m), scope).total for m in months if first is None or m >= first
    ]

    def average(n: int) -> Decimal | None:
        recent = totals[-n:]
        return (sum(recent, ZERO) / len(recent)).quantize(CENT) if recent else None

    return BudgetSuggestion(
        average_3m=average(3),
        average_6m=average(6),
        last_month=totals[-1].quantize(CENT) if totals else None,
        current_month=spending.get(month_key(start), scope).total.quantize(CENT),
    )


# --- Modifiche ------------------------------------------------------------------------------------


def _open_line(session: Session, scope: Scope) -> Budget | None:
    category, subcategory = scope
    return session.scalar(
        select(Budget).where(
            Budget.category_id == category,
            Budget.subcategory_id.is_(None)
            if subcategory is None
            else Budget.subcategory_id == subcategory,
            Budget.valid_to.is_(None),
        )
    )


def validate_scope(session: Session, category_id: int, subcategory_id: int | None) -> None:
    category = session.get(Category, category_id)
    if category is None:
        raise BudgetError("category.not_found", id=category_id)
    if category.kind != CategoryKind.EXPENSE or category.excluded_from_spending:
        raise BudgetError("budget.expense_only")
    if subcategory_id is not None:
        sub = session.get(Subcategory, subcategory_id)
        if sub is None or sub.category_id != category_id:
            raise BudgetError("subcategory.wrong_category")


def create_budget(session: Session, payload: BudgetCreate, today: date) -> Budget:
    validate_scope(session, payload.category_id, payload.subcategory_id)
    if _open_line(session, (payload.category_id, payload.subcategory_id)) is not None:
        raise BudgetConflictError("budget.exists")
    budget = Budget(
        category_id=payload.category_id,
        subcategory_id=payload.subcategory_id,
        amount=payload.amount,
        alert_threshold_pct=payload.alert_threshold_pct,
        valid_from=today.replace(day=1),
        is_active=True,
    )
    session.add(budget)
    session.flush()
    return budget


def update_budget(session: Session, budget: Budget, payload: BudgetUpdate, today: date) -> Budget:
    if budget.valid_to is not None:
        raise BudgetConflictError("budget.ended")
    if payload.alert_threshold_pct is not None:
        budget.alert_threshold_pct = payload.alert_threshold_pct
    if payload.amount is None or payload.amount == budget.amount:
        session.flush()
        return budget
    month_start = today.replace(day=1)
    if budget.valid_from >= month_start:
        budget.amount = payload.amount
        session.flush()
        return budget
    _close(budget, month_start)
    session.flush()  # prima di aprire la nuova versione (indice unico sui budget aperti)
    successor = Budget(
        category_id=budget.category_id,
        subcategory_id=budget.subcategory_id,
        amount=payload.amount,
        alert_threshold_pct=budget.alert_threshold_pct,
        valid_from=month_start,
        is_active=True,
    )
    session.add(successor)
    session.flush()
    return successor


def _close(budget: Budget, month_start: date) -> None:
    budget.valid_to = month_start - timedelta(days=1)
    budget.is_active = False


def end_budget(session: Session, budget: Budget, today: date) -> None:
    """Toglie il budget dal mese corrente; i mesi passati restano nello storico."""
    month_start = today.replace(day=1)
    if budget.valid_from >= month_start:
        session.delete(budget)
    elif budget.valid_to is None or budget.valid_to >= month_start:
        _close(budget, month_start)
    session.flush()
