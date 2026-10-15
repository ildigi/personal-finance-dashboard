from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import ColumnElement, and_, case, func, or_, select, true
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, get_or_404
from app.classification.engine import classify_all, simulate
from app.models import ManualOverride, Tag, Transaction, TransactionTag
from app.models.enums import OverrideField, TagSource, TransactionKind, TransactionStatus
from app.schemas.rules import LearnRequest, LearnResult, LearnScope, LearnSuggestion
from app.schemas.transactions import (
    BulkResult,
    ManualOverrideRead,
    TagCreate,
    TagRead,
    TransactionBulkUpdate,
    TransactionCreate,
    TransactionDetail,
    TransactionPage,
    TransactionPair,
    TransactionRead,
    TransactionSort,
    TransactionTotals,
    TransactionUpdate,
    TransferSuggestion,
)
from app.services.dates import today_rome
from app.services.rules import (
    apply_to_past,
    create_learned_rule,
    learn_proposal,
    rule_read,
)
from app.services.transactions import (
    TransactionConflictError,
    TransactionError,
    classification_override_count,
    create_manual_transaction,
    record_override,
    reset_classification,
    update_transaction,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])
transfers_router = APIRouter(prefix="/transfers", tags=["transactions"])
tags_router = APIRouter(prefix="/tags", tags=["transactions"])

_SORTS: dict[str, tuple[ColumnElement[Any], ...]] = {
    "date_desc": (Transaction.booking_date.desc(), Transaction.id.desc()),
    "date_asc": (Transaction.booking_date.asc(), Transaction.id.asc()),
    "amount_desc": (Transaction.amount_eur.desc(), Transaction.id.desc()),
    "amount_asc": (Transaction.amount_eur.asc(), Transaction.id.asc()),
}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _filters(
    *,
    date_from: date | None,
    date_to: date | None,
    account_id: list[int] | None,
    kind: list[TransactionKind] | None,
    category_id: int | None,
    subcategory_id: int | None,
    merchant_id: int | None,
    income_type_id: int | None,
    rule_id: int | None,
    recurring_id: int | None,
    status_: TransactionStatus | None,
    uncategorized: bool | None,
    unclassified: bool | None,
    q: str | None,
    amount_min: Decimal | None,
    amount_max: Decimal | None,
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if date_from:
        conditions.append(Transaction.booking_date >= date_from)
    if date_to:
        conditions.append(Transaction.booking_date <= date_to)
    if account_id:
        conditions.append(Transaction.account_id.in_(account_id))
    if kind:
        conditions.append(Transaction.kind.in_([k.value for k in kind]))
    if category_id is not None:
        conditions.append(Transaction.category_id == category_id)
    if subcategory_id is not None:
        conditions.append(Transaction.subcategory_id == subcategory_id)
    if merchant_id is not None:
        conditions.append(Transaction.merchant_id == merchant_id)
    if income_type_id is not None:
        conditions.append(Transaction.income_type_id == income_type_id)
    if rule_id is not None:
        conditions.append(Transaction.rule_id == rule_id)
    if recurring_id is not None:
        conditions.append(Transaction.recurring_id == recurring_id)
    if unclassified is True:
        conditions.append(Transaction.classification_source == "none")
    elif unclassified is False:
        conditions.append(Transaction.classification_source != "none")
    if status_:
        conditions.append(Transaction.status == status_.value)
    if uncategorized is True:
        conditions.append(Transaction.category_id.is_(None))
    elif uncategorized is False:
        conditions.append(Transaction.category_id.is_not(None))
    if q:
        pattern = f"%{_escape_like(q.strip())}%"
        conditions.append(
            or_(
                Transaction.description_clean.ilike(pattern, escape="\\"),
                Transaction.description_raw.ilike(pattern, escape="\\"),
                Transaction.counterparty_name.ilike(pattern, escape="\\"),
                Transaction.notes.ilike(pattern, escape="\\"),
            )
        )
    if amount_min is not None:
        conditions.append(Transaction.amount_eur >= amount_min)
    if amount_max is not None:
        conditions.append(Transaction.amount_eur <= amount_max)
    return conditions


@router.get("", response_model=TransactionPage)
def list_transactions(
    session: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    account_id: Annotated[list[int] | None, Query()] = None,
    kind: Annotated[list[TransactionKind] | None, Query()] = None,
    category_id: int | None = None,
    subcategory_id: int | None = None,
    merchant_id: int | None = None,
    income_type_id: int | None = None,
    rule_id: int | None = None,
    recurring_id: int | None = None,
    status_: Annotated[TransactionStatus | None, Query(alias="status")] = None,
    uncategorized: bool | None = None,
    unclassified: Annotated[
        bool | None, Query(description="Solo i movimenti che nessun passo ha classificato")
    ] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    amount_min: Annotated[Decimal | None, Query(description="Importo in EUR, con segno")] = None,
    amount_max: Annotated[Decimal | None, Query(description="Importo in EUR, con segno")] = None,
    sort: TransactionSort = "date_desc",
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TransactionPage:
    conditions = _filters(
        date_from=date_from,
        date_to=date_to,
        account_id=account_id,
        kind=kind,
        category_id=category_id,
        subcategory_id=subcategory_id,
        merchant_id=merchant_id,
        income_type_id=income_type_id,
        rule_id=rule_id,
        recurring_id=recurring_id,
        status_=status_,
        uncategorized=uncategorized,
        unclassified=unclassified,
        q=q,
        amount_min=amount_min,
        amount_max=amount_max,
    )
    where = and_(true(), *conditions)

    totals_row = session.execute(
        select(
            func.count(Transaction.id),
            func.coalesce(func.sum(case((Transaction.amount_eur > 0, Transaction.amount_eur))), 0),
            func.coalesce(func.sum(case((Transaction.amount_eur < 0, Transaction.amount_eur))), 0),
        ).where(where)
    ).one()

    page_query = (
        select(Transaction)
        .options(selectinload(Transaction.tags), selectinload(Transaction.merchant))
        .where(where)
        .order_by(*_SORTS[sort])
        .limit(limit)
        .offset(offset)
    )
    items = [TransactionRead.model_validate(tx) for tx in session.scalars(page_query)]

    return TransactionPage(
        items=items,
        total=totals_row[0],
        limit=limit,
        offset=offset,
        totals=TransactionTotals(
            count=totals_row[0], inflow_eur=totals_row[1], outflow_eur=totals_row[2]
        ),
    )


def _detail(session: DbSession, tx: Transaction) -> TransactionDetail:
    overrides = session.scalars(
        select(ManualOverride)
        .where(ManualOverride.transaction_id == tx.id)
        .order_by(ManualOverride.field)
    )
    detail = TransactionDetail.model_validate(tx)
    detail.overrides = [ManualOverrideRead.model_validate(o) for o in overrides]
    return detail


@router.get("/{transaction_id}", response_model=TransactionDetail)
def get_transaction(transaction_id: int, session: DbSession) -> TransactionDetail:
    return _detail(session, get_or_404(session, Transaction, transaction_id, "Movimento"))


@router.post("", response_model=TransactionDetail, status_code=status.HTTP_201_CREATED)
def create_transaction(payload: TransactionCreate, session: DbSession) -> TransactionDetail:
    """Inserimento manuale di un movimento."""
    try:
        tx = create_manual_transaction(session, payload)
    except TransactionError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    session.commit()
    session.refresh(tx)
    return _detail(session, tx)


@router.patch("/{transaction_id}", response_model=TransactionDetail)
def patch_transaction(
    transaction_id: int, payload: TransactionUpdate, session: DbSession
) -> TransactionDetail:
    """Correzione manuale: sopravvive alle sincronizzazioni successive."""
    tx = get_or_404(session, Transaction, transaction_id, "Movimento")
    was_linked = tx.transfer_pair_id is not None or tx.refund_of_id is not None
    corrections_before = classification_override_count(session, [tx.id])
    try:
        update_transaction(session, tx, payload)
    except TransactionError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except TransactionConflictError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    # Il tipo cambiato può sciogliere una coppia o un rimborso: si ricalcolano i collegamenti.
    relinked = "kind" in payload.model_fields_set and (was_linked or payload.kind in _LINKED_KINDS)
    # Una correzione annullata (tornando al valore di prima) va sostituita dalla classificazione
    # automatica.
    reverted = classification_override_count(session, [tx.id]) < corrections_before
    if relinked or reverted:
        classify_all(session)
    session.commit()
    session.refresh(tx)
    return _detail(session, tx)


@router.delete("/{transaction_id}/overrides", response_model=TransactionDetail)
def reset_transaction_classification(transaction_id: int, session: DbSession) -> TransactionDetail:
    """Ripristina la classificazione automatica: toglie le correzioni (le note restano)."""
    tx = get_or_404(session, Transaction, transaction_id, "Movimento")
    reset_classification(session, tx)
    classify_all(session)
    session.commit()
    session.refresh(tx)
    return _detail(session, tx)


_LINKED_KINDS = frozenset({TransactionKind.INTERNAL_TRANSFER, TransactionKind.REFUND})


@router.post("/bulk", response_model=BulkResult)
def bulk_update(payload: TransactionBulkUpdate, session: DbSession) -> BulkResult:
    """Azioni multiple: categoria, tipo, tipologia di entrata, tag."""
    txs = list(session.scalars(select(Transaction).where(Transaction.id.in_(payload.ids))))
    if len(txs) != len(set(payload.ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alcuni movimenti non esistono")
    fields = payload.model_dump(
        include={"kind", "category_id", "subcategory_id", "income_type_id"}, exclude_unset=True
    )
    tag_ids = {*payload.add_tag_ids, *payload.remove_tag_ids}
    known_tags = set(session.scalars(select(Tag.id).where(Tag.id.in_(tag_ids))))
    if tag_ids - known_tags:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Tag inesistenti: {sorted(tag_ids - known_tags)}",
        )
    update = TransactionUpdate(**fields)
    corrections_before = classification_override_count(session, payload.ids)
    try:
        for tx in txs:
            if fields:
                update_transaction(session, tx, update)
            for tag_id in payload.add_tag_ids:
                row = session.get(TransactionTag, (tx.id, tag_id))
                if row is None:
                    session.add(
                        TransactionTag(transaction_id=tx.id, tag_id=tag_id, source=TagSource.MANUAL)
                    )
                else:
                    row.source = TagSource.MANUAL
            for tag_id in payload.remove_tag_ids:
                row = session.get(TransactionTag, (tx.id, tag_id))
                if row is not None:
                    session.delete(row)
    except TransactionError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    if "kind" in fields or classification_override_count(session, payload.ids) < corrections_before:
        classify_all(session)
    session.commit()
    return BulkResult(updated=len(txs))


# --- Apprendimento dalle correzioni ----------------------------------------------------------


@router.get("/{transaction_id}/learn", response_model=LearnSuggestion | None)
def get_learn_suggestion(transaction_id: int, session: DbSession) -> LearnSuggestion | None:
    """Dopo una correzione: proposta di applicarla ai movimenti simili o di creare una regola."""
    tx = get_or_404(session, Transaction, transaction_id, "Movimento")
    proposal = learn_proposal(session, tx)
    if proposal is None:
        return None
    return LearnSuggestion(
        transaction_id=tx.id,
        merchant_id=proposal.merchant.id if proposal.merchant else None,
        subject=proposal.subject,
        rule_name=proposal.rule_name,
        similar_count=len(proposal.similar),
        conditions=proposal.conditions,
        actions=proposal.actions,
    )


@router.post("/{transaction_id}/learn", response_model=LearnResult)
def learn(transaction_id: int, payload: LearnRequest, session: DbSession) -> LearnResult:
    tx = get_or_404(session, Transaction, transaction_id, "Movimento")
    proposal = learn_proposal(session, tx)
    if proposal is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Nessuna correzione da applicare per questo movimento"
        )
    if payload.scope == LearnScope.PAST:
        updated = apply_to_past(session, proposal)
        session.commit()
        return LearnResult(updated=updated, rule=None)
    rule = create_learned_rule(session, proposal)
    before = {t.id: (t.kind, t.category_id, t.subcategory_id) for t in proposal.similar}
    classify_all(session)
    session.commit()
    session.refresh(rule)
    updated = sum(
        (t.kind, t.category_id, t.subcategory_id) != before[t.id] for t in proposal.similar
    )
    return LearnResult(updated=updated, rule=rule_read(rule, today_rome()))


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: int, session: DbSession) -> Response:
    """Solo i movimenti inseriti a mano si possono eliminare."""
    tx = get_or_404(session, Transaction, transaction_id, "Movimento")
    if not tx.is_manual:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "I movimenti sincronizzati non si possono eliminare"
        )
    session.delete(tx)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Trasferimenti interni da confermare ------------------------------------------------------


@transfers_router.get("/suggestions", response_model=list[TransferSuggestion])
def transfer_suggestions(session: DbSession) -> list[TransferSuggestion]:
    """Coppie possibili (importi opposti, date vicine, conti diversi) ma senza indizi."""
    result, by_id = simulate(session)
    ordered = sorted(result.suggestions, key=lambda m: by_id[m.out_id].booking_date, reverse=True)
    return [
        TransferSuggestion(
            outflow=TransactionRead.model_validate(by_id[m.out_id]),
            inflow=TransactionRead.model_validate(by_id[m.in_id]),
        )
        for m in ordered
    ]


def _pair_txs(session: DbSession, payload: TransactionPair) -> tuple[Transaction, Transaction]:
    out = get_or_404(session, Transaction, payload.out_id, "Movimento")
    inc = get_or_404(session, Transaction, payload.in_id, "Movimento")
    if out.amount_eur >= 0 or inc.amount_eur <= 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Serve un movimento in uscita e uno in entrata"
        )
    if out.account_id == inc.account_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "I due movimenti sono sullo stesso conto"
        )
    return out, inc


def _clear_kind_override(session: DbSession, tx: Transaction) -> None:
    override = session.scalar(
        select(ManualOverride).where(
            ManualOverride.transaction_id == tx.id, ManualOverride.field == OverrideField.KIND
        )
    )
    if override is not None:
        session.delete(override)


@transfers_router.post("", response_model=list[TransactionRead])
def pair_transfer(payload: TransactionPair, session: DbSession) -> list[TransactionRead]:
    """Conferma a mano un trasferimento interno tra due tuoi conti."""
    out, inc = _pair_txs(session, payload)
    for tx, partner in ((out, inc), (inc, out)):
        record_override(
            session, tx, OverrideField.TRANSFER_PAIR_ID, tx.transfer_pair_id, partner.id
        )
        _clear_kind_override(session, tx)
    session.flush()
    classify_all(session)
    session.commit()
    return [TransactionRead.model_validate(t) for t in (out, inc)]


@transfers_router.post("/dismiss", response_model=list[TransactionRead])
def dismiss_transfer(payload: TransactionPair, session: DbSession) -> list[TransactionRead]:
    """Non è un trasferimento: scioglie la coppia e non la propone più."""
    out, inc = _pair_txs(session, payload)
    for tx in (out, inc):
        record_override(session, tx, OverrideField.TRANSFER_PAIR_ID, tx.transfer_pair_id, None)
    session.flush()
    classify_all(session)
    session.commit()
    return [TransactionRead.model_validate(t) for t in (out, inc)]


# --- Tag ----------------------------------------------------------------------------------------


@tags_router.get("", response_model=list[TagRead])
def list_tags(session: DbSession) -> list[Tag]:
    return list(session.scalars(select(Tag).order_by(Tag.name)))


@tags_router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
def create_tag(payload: TagCreate, session: DbSession) -> Tag:
    tag = Tag(name=payload.name, color=payload.color)
    session.add(tag)
    session.commit()
    return tag
