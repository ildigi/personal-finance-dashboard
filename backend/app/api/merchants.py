"""Merchant: elenco con statistiche, modifica (nome, alias, categoria predefinita), unione."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import Select, case, desc, func, or_, select, update
from sqlalchemy.orm import Session

from app.api.deps import DbSession, get_or_404
from app.classification.engine import classify_all
from app.classification.text import match_text
from app.models import (
    Category,
    ManualOverride,
    Merchant,
    RecurringTransaction,
    Subcategory,
    Transaction,
    TransactionRule,
)
from app.models.enums import MerchantOrigin, OverrideField
from app.schemas.merchants import (
    MerchantMerge,
    MerchantPage,
    MerchantRead,
    MerchantUpdate,
    MerchantWithStats,
    MergeResult,
)
from app.services.analytics import spending_amount, spending_condition

router = APIRouter(prefix="/merchants", tags=["merchants"])


def _stats_query() -> Select[Any]:
    spent = func.coalesce(func.sum(case((spending_condition(), spending_amount()), else_=0)), 0)
    return (
        select(
            Merchant,
            func.count(Transaction.id).label("transaction_count"),
            spent.label("spent_eur"),
            func.max(Transaction.booking_date).label("last_date"),
        )
        .outerjoin(Transaction, Transaction.merchant_id == Merchant.id)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .group_by(Merchant.id)
    )


def _with_stats(row: Any) -> MerchantWithStats:
    merchant, count, spent, last = row
    item = MerchantWithStats.model_validate(merchant)
    item.transaction_count, item.spent_eur, item.last_date = count, spent, last
    return item


@router.get("", response_model=MerchantPage)
def list_merchants(
    session: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    used_only: bool = True,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> MerchantPage:
    """Per spesa decrescente. `used_only`: solo i merchant con almeno un movimento."""
    query = _stats_query()
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(Merchant.name.ilike(pattern), Merchant.normalized_key.ilike(pattern))
        )
    if used_only:
        query = query.having(func.count(Transaction.id) > 0)
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = session.execute(
        query.order_by(desc("spent_eur"), Merchant.name).limit(limit).offset(offset)
    )
    return MerchantPage(
        items=[_with_stats(r) for r in rows], total=total, limit=limit, offset=offset
    )


@router.get("/{merchant_id}", response_model=MerchantWithStats)
def get_merchant(merchant_id: int, session: DbSession) -> MerchantWithStats:
    get_or_404(session, Merchant, merchant_id, "Merchant")
    return _with_stats(session.execute(_stats_query().where(Merchant.id == merchant_id)).one())


def _check_default_category(
    session: Session, category_id: int | None, subcategory_id: int | None
) -> tuple[int | None, int | None]:
    if subcategory_id is not None:
        sub = session.get(Subcategory, subcategory_id)
        if sub is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Sottocategoria inesistente")
        if category_id is not None and category_id != sub.category_id:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "La sottocategoria non appartiene alla categoria indicata",
            )
        return sub.category_id, sub.id
    if category_id is not None and session.get(Category, category_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Categoria inesistente")
    return category_id, None


@router.patch("/{merchant_id}", response_model=MerchantRead)
def update_merchant(merchant_id: int, payload: MerchantUpdate, session: DbSession) -> Merchant:
    """Le modifiche valgono anche per il passato: i movimenti vengono riclassificati."""
    merchant = get_or_404(session, Merchant, merchant_id, "Merchant")
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        if changes["name"] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Il nome è obbligatorio")
        merchant.name = changes["name"]
    if "aliases" in changes:
        merchant.aliases = sorted(
            {a for a in (match_text(x) for x in changes["aliases"] or []) if a}
        )
    if changes.keys() & {"default_category_id", "default_subcategory_id"}:
        category_id = changes.get("default_category_id", merchant.default_category_id)
        subcategory_id = changes.get("default_subcategory_id")
        if "default_subcategory_id" not in changes and category_id == merchant.default_category_id:
            subcategory_id = merchant.default_subcategory_id
        merchant.default_category_id, merchant.default_subcategory_id = _check_default_category(
            session, category_id, subcategory_id
        )
    merchant.origin = MerchantOrigin.USER
    session.flush()
    classify_all(session)
    session.commit()
    return merchant


def _replace_merchant_in_json(data: dict[str, Any], old: int, new: int) -> dict[str, Any] | None:
    if data.get("merchant_id") == old:
        return {**data, "merchant_id": new}
    return None


@router.post("/{merchant_id}/merge", response_model=MergeResult)
def merge_merchant(merchant_id: int, payload: MerchantMerge, session: DbSession) -> MergeResult:
    """Unisce questo merchant in un altro (es. "AMZN Mktp" in "Amazon")."""
    source = get_or_404(session, Merchant, merchant_id, "Merchant")
    target = get_or_404(session, Merchant, payload.into_id, "Merchant")
    if source.id == target.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Scegli un merchant diverso")

    # Le varianti del merchant eliminato diventano alias di quello che resta.
    extra = {*source.aliases, source.normalized_key.replace("-", " "), match_text(source.name)}
    target.aliases = sorted({*target.aliases, *(a for a in extra if a)})
    if target.default_category_id is None and source.default_category_id is not None:
        target.default_category_id = source.default_category_id
        target.default_subcategory_id = source.default_subcategory_id
    target.origin = MerchantOrigin.USER

    moved = len(
        session.scalars(
            update(Transaction)
            .where(Transaction.merchant_id == source.id)
            .values(merchant_id=target.id)
            .returning(Transaction.id)
        ).all()
    )
    session.execute(
        update(ManualOverride)
        .where(
            ManualOverride.field == OverrideField.MERCHANT_ID,
            ManualOverride.new_value == str(source.id),
        )
        .values(new_value=str(target.id))
    )
    session.execute(
        update(RecurringTransaction)
        .where(RecurringTransaction.merchant_id == source.id)
        .values(merchant_id=target.id)
    )
    for rule in session.scalars(select(TransactionRule)):
        conditions = _replace_merchant_in_json(rule.conditions, source.id, target.id)
        actions = _replace_merchant_in_json(rule.actions, source.id, target.id)
        if conditions is not None:
            rule.conditions = conditions
        if actions is not None:
            rule.actions = actions
    session.flush()
    session.delete(source)
    session.flush()
    classify_all(session)
    session.commit()
    return MergeResult(merchant=MerchantRead.model_validate(target), moved_transactions=moved)
