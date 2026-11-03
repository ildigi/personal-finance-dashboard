"""Regole: validazione dei riferimenti, anteprima, apprendimento dalle correzioni (SPEC §11)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classification.engine import simulate
from app.classification.rules import PREVIEW_RULE_ID, CompiledRule
from app.models import (
    Account,
    Category,
    IncomeClassification,
    ManualOverride,
    Merchant,
    Subcategory,
    Tag,
    Transaction,
    TransactionRule,
)
from app.models.enums import (
    ClassificationSource,
    Direction,
    OverrideField,
    RuleOrigin,
    TransactionKind,
)
from app.schemas.rules import (
    PreviewChange,
    RuleActions,
    RuleConditions,
    RulePreview,
    RulePreviewRequest,
    RuleRead,
)
from app.schemas.transactions import TransactionUpdate
from app.services.transactions import TransactionError, update_transaction

#: Una regola che non classifica nulla di recente viene segnalata.
STALE_AFTER_DAYS = 180
#: Le regole appena create non sono "ferme": hanno bisogno di tempo per trovare movimenti.
GRACE_DAYS = 30
PREVIEW_LIMIT = 100


def validate_references(
    session: Session, conditions: RuleConditions, actions: RuleActions
) -> RuleActions:
    """Controlla che gli id citati esistano; ricava la categoria dalla sottocategoria."""

    def exists(model: type[object], pk: int | None) -> None:
        if pk is not None and session.get(model, pk) is None:
            raise TransactionError("not_found", id=pk)

    exists(Merchant, conditions.merchant_id)
    exists(Account, conditions.account_id)
    exists(Merchant, actions.merchant_id)
    exists(IncomeClassification, actions.income_type_id)
    for tag_id in actions.tag_ids or []:
        exists(Tag, tag_id)

    if actions.subcategory_id is not None:
        sub = session.get(Subcategory, actions.subcategory_id)
        if sub is None:
            raise TransactionError("subcategory.not_found", id=actions.subcategory_id)
        if actions.category_id is not None and actions.category_id != sub.category_id:
            raise TransactionError("subcategory.wrong_category")
        return actions.model_copy(update={"category_id": sub.category_id})
    exists(Category, actions.category_id)
    return actions


def rule_read(rule: TransactionRule, today: date) -> RuleRead:
    item = RuleRead.model_validate(rule)
    created = rule.created_at.date() if rule.created_at else today
    if rule.is_active and (today - created).days > GRACE_DAYS:
        last = rule.last_matched_at.date() if rule.last_matched_at else None
        item.is_stale = last is None or (today - last).days > STALE_AFTER_DAYS
    return item


def ordered_rules(session: Session) -> list[TransactionRule]:
    rules = list(session.scalars(select(TransactionRule)))
    return sorted(rules, key=lambda r: (int(r.origin == RuleOrigin.SEED), r.priority, r.id))


def preview_rule(session: Session, request: RulePreviewRequest) -> RulePreview:
    actions = validate_references(session, request.conditions, request.actions)
    origin = RuleOrigin.USER
    if request.rule_id is not None:
        existing = session.get(TransactionRule, request.rule_id)
        if existing is None:
            raise TransactionError("not_found", id=request.rule_id)
        origin = RuleOrigin(existing.origin)
    candidate = CompiledRule(
        id=PREVIEW_RULE_ID,
        name=request.name,
        origin=origin,
        priority=request.priority,
        conditions=request.conditions,
        actions=actions,
    )
    result, by_id = simulate(session, extra_rule=candidate, replace_rule_id=request.rule_id)
    applied = [tx_id for tx_id, d in result.decisions.items() if d.rule_id == PREVIEW_RULE_ID]
    changes: list[PreviewChange] = []
    for tx_id in applied:
        tx, d = by_id[tx_id], result.decisions[tx_id]
        if (tx.kind, tx.category_id, tx.subcategory_id) == (
            d.kind,
            d.category_id,
            d.subcategory_id,
        ):
            continue
        changes.append(
            PreviewChange(
                transaction_id=tx.id,
                booking_date=tx.booking_date,
                description=tx.description_clean,
                amount_eur=tx.amount_eur,
                before_kind=TransactionKind(tx.kind),
                before_category_id=tx.category_id,
                before_subcategory_id=tx.subcategory_id,
                after_kind=TransactionKind(d.kind),
                after_category_id=d.category_id,
                after_subcategory_id=d.subcategory_id,
            )
        )
    changes.sort(key=lambda c: (c.booking_date, c.transaction_id), reverse=True)
    return RulePreview(
        matched=len(result.preview_matches),
        changed=len(changes),
        blocked=len(result.preview_matches) - len(applied),
        changes=changes[:PREVIEW_LIMIT],
    )


# --- Apprendimento dalle correzioni ----------------------------------------------------------


@dataclass
class LearnProposal:
    transaction: Transaction
    merchant: Merchant | None
    conditions: RuleConditions
    actions: RuleActions
    subject: str
    rule_name: str
    similar: list[Transaction]


def _classification_actions(tx: Transaction) -> RuleActions | None:
    kind = TransactionKind(tx.kind)
    default = TransactionKind.EXPENSE if tx.amount_eur < 0 else TransactionKind.INCOME
    data: dict[str, object] = {}
    if tx.subcategory_id is not None:
        data["subcategory_id"] = tx.subcategory_id
    if tx.category_id is not None:
        data["category_id"] = tx.category_id
    if tx.income_type_id is not None:
        data["income_type_id"] = tx.income_type_id
    if kind != default:
        data["kind"] = kind
    return RuleActions.model_validate(data) if data else None


def _label(session: Session, actions: RuleActions) -> str:
    parts: list[str] = []
    if actions.category_id is not None:
        category = session.get(Category, actions.category_id)
        parts.append(category.name if category else "?")
    if actions.subcategory_id is not None:
        sub = session.get(Subcategory, actions.subcategory_id)
        parts.append(sub.name if sub else "?")
    if actions.income_type_id is not None:
        income = session.get(IncomeClassification, actions.income_type_id)
        parts.append(income.label if income else "?")
    text = " › ".join(parts)
    if actions.kind is not None:
        text = f"{text} ({actions.kind})" if text else str(actions.kind)
    return text


def learn_proposal(session: Session, tx: Transaction) -> LearnProposal | None:
    """Dopo una correzione: "applicare a tutti i movimenti di OpenAI?"."""
    if tx.classification_source != ClassificationSource.MANUAL:
        return None
    actions = _classification_actions(tx)
    if actions is None:
        return None

    merchant = session.get(Merchant, tx.merchant_id) if tx.merchant_id else None
    if merchant is not None:
        conditions = RuleConditions(merchant_id=merchant.id)
        subject = merchant.name
        same = Transaction.merchant_id == merchant.id
    elif tx.counterparty_iban:
        conditions = RuleConditions(counterparty_iban=tx.counterparty_iban)
        subject = tx.counterparty_name or tx.counterparty_iban
        same = Transaction.counterparty_iban == tx.counterparty_iban
    else:
        return None
    direction_ok = Transaction.amount_eur < 0 if tx.amount_eur < 0 else Transaction.amount_eur > 0
    outflow = tx.amount_eur < 0
    conditions = conditions.model_copy(
        update={"direction": Direction.OUT if outflow else Direction.IN}
    )

    corrected = select(ManualOverride.transaction_id).where(
        ManualOverride.field.in_(
            [OverrideField.KIND, OverrideField.CATEGORY_ID, OverrideField.SUBCATEGORY_ID]
        )
    )
    candidates = session.scalars(
        select(Transaction)
        .where(
            same,
            direction_ok,
            Transaction.id != tx.id,
            Transaction.id.not_in(corrected),
            Transaction.kind.not_in(
                [TransactionKind.INTERNAL_TRANSFER, TransactionKind.INVESTMENT_TRANSFER]
            ),
        )
        .order_by(Transaction.booking_date.desc())
    )
    similar = [
        t
        for t in candidates
        if (t.kind, t.category_id, t.subcategory_id, t.income_type_id)
        != (tx.kind, tx.category_id, tx.subcategory_id, tx.income_type_id)
        and not (t.is_manual and t.classification_source == ClassificationSource.MANUAL)
    ]
    return LearnProposal(
        transaction=tx,
        merchant=merchant,
        conditions=conditions,
        actions=actions,
        subject=subject,
        rule_name=f"{subject} → {_label(session, actions)}",
        similar=similar,
    )


def apply_to_past(session: Session, proposal: LearnProposal) -> int:
    """Stessa correzione sui movimenti simili, come correzioni manuali (niente regola)."""
    a = proposal.actions
    tx = proposal.transaction
    update = TransactionUpdate(
        kind=TransactionKind(tx.kind),
        category_id=a.category_id,
        subcategory_id=a.subcategory_id,
        income_type_id=a.income_type_id,
    )
    for other in proposal.similar:
        update_transaction(session, other, update)
    return len(proposal.similar)


def create_learned_rule(session: Session, proposal: LearnProposal) -> TransactionRule:
    rule = TransactionRule(
        name=proposal.rule_name[:200],
        priority=100,
        origin=RuleOrigin.LEARNED,
        conditions=proposal.conditions.model_dump(mode="json", exclude_none=True),
        actions=proposal.actions.model_dump(mode="json", exclude_none=True),
        match_count=0,
        last_matched_at=datetime.now(UTC),
    )
    session.add(rule)
    session.flush()
    return rule
