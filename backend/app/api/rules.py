"""Regole di classificazione e stato della classificazione (pagina Regole)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select

from app.api.deps import DbSession, get_or_404
from app.classification.engine import classify_all, simulate
from app.models import Transaction, TransactionRule
from app.models.enums import ClassificationSource, RuleOrigin
from app.schemas.rules import (
    ClassificationRunResult,
    ClassificationStats,
    RuleActions,
    RuleConditions,
    RuleCreate,
    RulePreview,
    RulePreviewRequest,
    RuleRead,
    RuleReorder,
    RuleUpdate,
)
from app.services.dates import today_rome
from app.services.rules import ordered_rules, preview_rule, rule_read, validate_references
from app.services.transactions import TransactionError

router = APIRouter(tags=["rules"])


def _unprocessable(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))


def _reclassify_and_read(session: DbSession, rule: TransactionRule) -> RuleRead:
    classify_all(session)
    session.commit()
    session.refresh(rule)
    return rule_read(rule, today_rome())


@router.get("/rules", response_model=list[RuleRead])
def list_rules(session: DbSession) -> list[RuleRead]:
    """Nell'ordine in cui vengono valutate: prima le tue, poi quelle di sistema."""
    today = today_rome()
    return [rule_read(r, today) for r in ordered_rules(session)]


@router.post("/rules", response_model=RuleRead, status_code=status.HTTP_201_CREATED)
def create_rule(payload: RuleCreate, session: DbSession) -> RuleRead:
    try:
        actions = validate_references(session, payload.conditions, payload.actions)
    except TransactionError as exc:
        raise _unprocessable(exc) from exc
    rule = TransactionRule(
        name=payload.name,
        priority=payload.priority,
        is_active=payload.is_active,
        origin=RuleOrigin.USER,
        conditions=payload.conditions.model_dump(mode="json", exclude_none=True),
        actions=actions.model_dump(mode="json", exclude_none=True),
    )
    session.add(rule)
    session.flush()
    return _reclassify_and_read(session, rule)


@router.patch("/rules/{rule_id}", response_model=RuleRead)
def update_rule(rule_id: int, payload: RuleUpdate, session: DbSession) -> RuleRead:
    rule = get_or_404(session, TransactionRule, rule_id, "Regola")
    changes = payload.model_dump(exclude_unset=True)
    for field in ("name", "priority", "is_active", "conditions", "actions"):
        if field in changes and changes[field] is None:
            raise _unprocessable(ValueError(f"Il campo {field} non può essere vuoto"))
    if rule.origin == RuleOrigin.SEED and changes.keys() & {"conditions", "actions"}:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Le regole di sistema non si modificano: disattivale e creane una tua",
        )
    if payload.conditions is not None or payload.actions is not None:
        conditions = payload.conditions or RuleConditions.model_validate(rule.conditions)
        actions = payload.actions or RuleActions.model_validate(rule.actions)
        try:
            actions = validate_references(session, conditions, actions)
        except TransactionError as exc:
            raise _unprocessable(exc) from exc
        rule.conditions = conditions.model_dump(mode="json", exclude_none=True)
        rule.actions = actions.model_dump(mode="json", exclude_none=True)
    for field in ("name", "priority", "is_active"):
        if field in changes:
            setattr(rule, field, changes[field])
    if rule.origin == RuleOrigin.LEARNED and changes.keys() & {"conditions", "actions"}:
        rule.origin = RuleOrigin.USER  # modificata da te: non è più solo "imparata"
    session.flush()
    return _reclassify_and_read(session, rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, session: DbSession) -> Response:
    rule = get_or_404(session, TransactionRule, rule_id, "Regola")
    if rule.origin == RuleOrigin.SEED:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Le regole di sistema non si eliminano: disattivale"
        )
    session.delete(rule)
    session.flush()
    classify_all(session)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/rules/reorder", response_model=list[RuleRead])
def reorder_rules(payload: RuleReorder, session: DbSession) -> list[RuleRead]:
    """Assegna priorità 10, 20, 30, ... nell'ordine dato (solo le tue regole)."""
    rules = {r.id: r for r in session.scalars(select(TransactionRule))}
    missing = [i for i in payload.rule_ids if i not in rules]
    if missing:
        raise _unprocessable(ValueError(f"Regole inesistenti: {missing}"))
    if any(rules[i].origin == RuleOrigin.SEED for i in payload.rule_ids):
        raise _unprocessable(ValueError("Le regole di sistema hanno un ordine fisso"))
    for position, rule_id in enumerate(payload.rule_ids, start=1):
        rules[rule_id].priority = position * 10
    session.flush()
    classify_all(session)
    session.commit()
    return list_rules(session)


@router.post("/rules/preview", response_model=RulePreview)
def preview(payload: RulePreviewRequest, session: DbSession) -> RulePreview:
    """Prova una regola sui movimenti esistenti: cosa cambierebbe, senza salvare nulla."""
    try:
        return preview_rule(session, payload)
    except TransactionError as exc:
        raise _unprocessable(exc) from exc


# --- Stato della classificazione ------------------------------------------------------------


@router.get("/classification/stats", response_model=ClassificationStats)
def classification_stats(session: DbSession) -> ClassificationStats:
    by_source: dict[str, int] = dict(
        session.execute(
            select(Transaction.classification_source, func.count()).group_by(
                Transaction.classification_source
            )
        ).all()
    )
    total = sum(by_source.values())
    manual = by_source.get(ClassificationSource.MANUAL, 0)
    unclassified = by_source.get(ClassificationSource.NONE, 0)
    auto = total - manual - unclassified
    today = today_rome()
    rules = [rule_read(r, today) for r in ordered_rules(session)]
    return ClassificationStats(
        total=total,
        auto_classified=auto,
        manual=manual,
        unclassified=unclassified,
        auto_pct=round(100 * auto / total, 1) if total else 0.0,
        by_source=by_source,
        active_rules=sum(r.is_active for r in rules),
        stale_rules=sum(r.is_stale for r in rules),
        transfer_suggestions=len(simulate(session)[0].suggestions),
    )


@router.post("/classification/run", response_model=ClassificationRunResult)
def run_classification(session: DbSession) -> ClassificationRunResult:
    """Riclassifica tutti i movimenti (le correzioni manuali restano)."""
    result = classify_all(session)
    session.commit()
    return ClassificationRunResult(
        total=result.total,
        changed=result.changed,
        transfer_pairs=result.transfer_pairs,
        investment_links=result.investment_links,
        refunds_linked=result.refunds_linked,
        merchants_created=result.merchants_created,
    )
