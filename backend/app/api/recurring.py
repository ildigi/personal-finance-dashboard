"""Ricorrenze: proposte da confermare, abbonamenti, prossimi addebiti."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import DbSession, get_or_404
from app.models import Category, RecurringTransaction, Transaction
from app.models.enums import Direction, Frequency, RecurringStatus, TransactionKind
from app.recurring.service import (
    is_late,
    monthly_equivalent,
    refresh_recurring,
    upcoming,
)
from app.schemas.planning import (
    RecurringOverview,
    RecurringRead,
    RecurringSummary,
    RecurringUpdate,
    UpcomingCharge,
)
from app.services.analytics import SUBSCRIPTIONS_CODE, ZERO
from app.services.dates import today_rome

router = APIRouter(prefix="/recurring", tags=["recurring"])

_STATUS_ORDER = {
    RecurringStatus.SUGGESTED: 0,
    RecurringStatus.CONFIRMED: 1,
    RecurringStatus.ENDED: 2,
    RecurringStatus.REJECTED: 3,
}


def _read(row: RecurringTransaction, occurrences: int, today: date) -> RecurringRead:
    return RecurringRead(
        id=row.id,
        name=row.name,
        status=row.status,
        direction=row.direction,
        kind=row.kind,
        merchant_id=row.merchant_id,
        category_id=row.category_id,
        subcategory_id=row.subcategory_id,
        frequency=row.frequency,
        interval_days=row.interval_days,
        expected_amount=row.expected_amount,
        amount_tolerance_pct=row.amount_tolerance_pct,
        monthly_eur=monthly_equivalent(row),
        next_expected_date=row.next_expected_date,
        last_seen_date=row.last_seen_date,
        confidence=float(row.confidence) if row.confidence is not None else None,
        occurrences=occurrences,
        is_late=is_late(row, today),
    )


def _occurrences(session: Session) -> dict[int, int]:
    rows = session.execute(
        select(Transaction.recurring_id, func.count(Transaction.id))
        .where(Transaction.recurring_id.is_not(None))
        .group_by(Transaction.recurring_id)
    )
    return {rid: n for rid, n in rows if rid is not None}


def recurring_summary(session: Session, rows: list[RecurringTransaction]) -> RecurringSummary:
    today = today_rome()
    subscriptions = session.scalar(select(Category.id).where(Category.code == SUBSCRIPTIONS_CODE))
    confirmed = [r for r in rows if r.status == RecurringStatus.CONFIRMED]

    def total(predicate: Callable[[RecurringTransaction], bool]) -> Decimal:
        return sum((monthly_equivalent(r) for r in confirmed if predicate(r)), ZERO)

    spending = (TransactionKind.EXPENSE, TransactionKind.FEE)
    return RecurringSummary(
        expenses_monthly_eur=total(lambda r: r.direction == Direction.OUT and r.kind in spending),
        subscriptions_monthly_eur=total(
            lambda r: r.direction == Direction.OUT and r.category_id == subscriptions
        ),
        income_monthly_eur=total(lambda r: r.direction == Direction.IN),
        invested_monthly_eur=total(
            lambda r: r.kind == TransactionKind.INVESTMENT_TRANSFER and r.direction == Direction.OUT
        ),
        confirmed_count=len(confirmed),
        suggested_count=sum(r.status == RecurringStatus.SUGGESTED for r in rows),
        late_count=sum(is_late(r, today) for r in confirmed),
    )


@router.get("", response_model=RecurringOverview)
def list_recurring(session: DbSession) -> RecurringOverview:
    """Tutte le ricorrenze: proposte, confermate, terminate, rifiutate."""
    today = today_rome()
    rows = list(session.scalars(select(RecurringTransaction)))
    counts = _occurrences(session)
    rows.sort(
        key=lambda r: (
            _STATUS_ORDER[RecurringStatus(r.status)],
            r.direction != Direction.OUT,
            -monthly_equivalent(r),
            r.name,
        )
    )
    return RecurringOverview(
        summary=recurring_summary(session, rows),
        items=[_read(r, counts.get(r.id, 0), today) for r in rows],
    )


@router.get("/upcoming", response_model=list[UpcomingCharge])
def list_upcoming(
    session: DbSession,
    days: Annotated[int, Query(ge=1, le=120)] = 30,
    direction: Direction | None = None,
    include_suggested: bool = False,
) -> list[UpcomingCharge]:
    """Addebiti e accrediti attesi nei prossimi giorni (più quelli appena scaduti e non ancora
    arrivati), dalle ricorrenze confermate."""
    today = today_rome()
    statuses = [RecurringStatus.CONFIRMED.value]
    if include_suggested:
        statuses.append(RecurringStatus.SUGGESTED.value)
    query = select(RecurringTransaction).where(RecurringTransaction.status.in_(statuses))
    if direction is not None:
        query = query.where(RecurringTransaction.direction == direction.value)
    rows = list(session.scalars(query))
    return [
        UpcomingCharge(
            recurring_id=u.row.id,
            name=u.row.name,
            date=u.day,
            amount_eur=u.row.expected_amount * (-1 if u.row.direction == Direction.OUT else 1),
            direction=u.row.direction,
            kind=u.row.kind,
            category_id=u.row.category_id,
            subcategory_id=u.row.subcategory_id,
            status=u.row.status,
            overdue=u.overdue,
        )
        for u in upcoming(rows, today - timedelta(days=31), today + timedelta(days=days), today)
    ]


@router.patch("/{recurring_id}", response_model=RecurringRead)
def patch_recurring(
    recurring_id: int, payload: RecurringUpdate, session: DbSession
) -> RecurringRead:
    """Conferma, rifiuta, termina o correggi (correggere una proposta la conferma)."""
    row = get_or_404(session, RecurringTransaction, recurring_id)
    changes = payload.model_dump(exclude_unset=True, exclude={"status"})
    for field, value in changes.items():
        if value is not None:
            setattr(row, field, value)
    if payload.frequency is not None and payload.frequency != Frequency.CUSTOM:
        row.interval_days = None
    if payload.status is not None:
        row.status = payload.status
    elif changes and row.status == RecurringStatus.SUGGESTED:
        row.status = RecurringStatus.CONFIRMED
    session.flush()
    refresh_recurring(session)
    session.commit()
    session.refresh(row)
    return _read(row, _occurrences(session).get(row.id, 0), today_rome())


@router.delete("/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring(recurring_id: int, session: DbSession) -> Response:
    """Dimentica la ricorrenza e la tua decisione: se la serie c'è ancora, torna come proposta
    (così si "ripristina" una ricorrenza rifiutata)."""
    row = get_or_404(session, RecurringTransaction, recurring_id)
    session.delete(row)
    session.flush()
    refresh_recurring(session)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
