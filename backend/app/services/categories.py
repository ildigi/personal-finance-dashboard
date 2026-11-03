"""Unione di categorie e sottocategorie: tutto ciò che usava la prima passa alla seconda."""

from __future__ import annotations

from dataclasses import astuple, dataclass
from typing import Any

from sqlalchemy import ColumnElement, func, or_, select, update
from sqlalchemy.orm import Session

from app.core.messages import AppError
from app.models import (
    Budget,
    Category,
    ManualOverride,
    Merchant,
    RecurringTransaction,
    Subcategory,
    Transaction,
    TransactionRule,
)
from app.models.enums import OverrideField


class MergeError(AppError, ValueError):
    pass


def _target_subcategory(session: Session, target: Category, sub: Subcategory) -> Subcategory:
    """La sottocategoria omonima della destinazione, o una nuova con lo stesso nome."""
    for candidate in target.subcategories:
        if candidate.name.casefold() == sub.name.casefold():
            return candidate
    codes = {s.code for s in target.subcategories}
    created = Subcategory(
        category_id=target.id,
        name=sub.name,
        code=sub.code if sub.code not in codes else None,
        sort_order=sub.sort_order,
        is_archived=sub.is_archived,
    )
    session.add(created)
    session.flush()
    target.subcategories.append(created)
    return created


def _remap_json(
    data: dict[str, Any], source_id: int, target_id: int, subs: dict[int, int]
) -> dict[str, Any] | None:
    changed = dict(data)
    if changed.get("category_id") == source_id:
        changed["category_id"] = target_id
    if changed.get("subcategory_id") in subs:
        changed["subcategory_id"] = subs[changed["subcategory_id"]]
        changed["category_id"] = target_id
    return changed if changed != data else None


def _merge_open_budgets(
    session: Session, source: Category, target: Category, sub_map: dict[int, int]
) -> None:
    """Se origine e destinazione hanno entrambe un budget aperto sulla stessa voce, quello
    della destinazione diventa la somma dei due (le spese ora finiscono tutte lì)."""
    open_budgets = list(
        session.scalars(
            select(Budget).where(
                Budget.valid_to.is_(None), Budget.category_id.in_([source.id, target.id])
            )
        )
    )
    on_target = {b.subcategory_id: b for b in open_budgets if b.category_id == target.id}
    for budget in open_budgets:
        if budget.category_id != source.id:
            continue
        mapped = sub_map.get(budget.subcategory_id) if budget.subcategory_id else None
        existing = on_target.get(mapped)
        if existing is not None:
            existing.amount += budget.amount
            session.delete(budget)
    session.flush()


def merge_categories(session: Session, source: Category, target: Category) -> int:
    """Restituisce il numero di movimenti spostati. Il commit è a carico del chiamante."""
    if source.id == target.id:
        raise MergeError("category.merge_same")
    if source.is_system:
        raise MergeError("category.system_not_mergeable")

    sub_map = {sub.id: _target_subcategory(session, target, sub).id for sub in source.subcategories}

    _merge_open_budgets(session, source, target, sub_map)

    moved = 0
    # Per ogni sottocategoria, categoria e sottocategoria cambiano nella stessa istruzione
    # (le FK composte non ammettono stati intermedi).
    for model, cat_col, sub_col in (
        (Transaction, "category_id", "subcategory_id"),
        (Budget, "category_id", "subcategory_id"),
        (RecurringTransaction, "category_id", "subcategory_id"),
        (Merchant, "default_category_id", "default_subcategory_id"),
    ):
        cat = getattr(model, cat_col)
        sub = getattr(model, sub_col)
        for old_sub, new_sub in sub_map.items():
            result = session.execute(
                update(model).where(sub == old_sub).values({cat_col: target.id, sub_col: new_sub})
            )
            if model is Transaction:
                moved += result.rowcount  # type: ignore[attr-defined]
        result = session.execute(
            update(model).where(cat == source.id, sub.is_(None)).values({cat_col: target.id})
        )
        if model is Transaction:
            moved += result.rowcount  # type: ignore[attr-defined]

    session.execute(
        update(ManualOverride)
        .where(
            ManualOverride.field == OverrideField.CATEGORY_ID,
            ManualOverride.new_value == str(source.id),
        )
        .values(new_value=str(target.id))
    )
    for old_sub, new_sub in sub_map.items():
        session.execute(
            update(ManualOverride)
            .where(
                ManualOverride.field == OverrideField.SUBCATEGORY_ID,
                ManualOverride.new_value == str(old_sub),
            )
            .values(new_value=str(new_sub))
        )
    for rule in session.scalars(select(TransactionRule)):
        actions = _remap_json(rule.actions, source.id, target.id, sub_map)
        if actions is not None:
            rule.actions = actions

    session.flush()
    for sub in list(source.subcategories):
        session.delete(sub)
    session.flush()
    session.delete(source)
    session.flush()
    return moved


# --- Sottocategorie ---------------------------------------------------------------------


@dataclass(frozen=True)
class SubcategoryUsage:
    transactions: int
    rules: int
    budgets: int
    recurring: int
    merchants: int
    overrides: int

    @property
    def in_use(self) -> bool:
        return any(astuple(self))


def _count(session: Session, condition: ColumnElement[bool]) -> int:
    return session.scalar(select(func.count()).where(condition)) or 0


def _rules_using(session: Session, sub_id: int) -> list[TransactionRule]:
    return [
        r
        for r in session.scalars(select(TransactionRule))
        if r.actions.get("subcategory_id") == sub_id
    ]


def _overrides_using(session: Session, sub_id: int) -> list[ManualOverride]:
    value = str(sub_id)
    return list(
        session.scalars(
            select(ManualOverride).where(
                ManualOverride.field == OverrideField.SUBCATEGORY_ID,
                or_(ManualOverride.new_value == value, ManualOverride.old_value == value),
            )
        )
    )


def subcategory_usage(session: Session, sub: Subcategory) -> SubcategoryUsage:
    """Quanto usa la sottocategoria: decide se si può eliminare subito o va prima svuotata."""
    return SubcategoryUsage(
        transactions=_count(session, Transaction.subcategory_id == sub.id),
        rules=len(_rules_using(session, sub.id)),
        # Tutte le versioni, anche chiuse: anche lo storico punta alla sottocategoria.
        budgets=_count(session, Budget.subcategory_id == sub.id),
        recurring=_count(session, RecurringTransaction.subcategory_id == sub.id),
        merchants=_count(session, Merchant.default_subcategory_id == sub.id),
        overrides=len(_overrides_using(session, sub.id)),
    )


def _move_budgets(session: Session, source: Subcategory, target: Subcategory | None) -> None:
    """Verso un'altra sottocategoria il budget la segue (sommato a quello aperto della
    destinazione, se c'è); senza destinazione il budget della sottocategoria non ha più
    senso e viene eliminato con il suo storico (la spesa resta nel budget della categoria)."""
    budgets = list(session.scalars(select(Budget).where(Budget.subcategory_id == source.id)))
    if target is None:
        for budget in budgets:
            session.delete(budget)
        session.flush()
        return
    open_target = session.scalar(
        select(Budget).where(Budget.subcategory_id == target.id, Budget.valid_to.is_(None))
    )
    for budget in budgets:
        if budget.valid_to is None and open_target is not None:
            open_target.amount += budget.amount
            session.delete(budget)
    session.flush()
    session.execute(
        update(Budget).where(Budget.subcategory_id == source.id).values(subcategory_id=target.id)
    )


def merge_subcategory(session: Session, source: Subcategory, target: Subcategory | None) -> int:
    """Elimina `source` spostando tutto ciò che la usa su `target` (della stessa categoria)
    o, con `None`, sulla sola categoria. Le correzioni manuali restano valide: puntano alla
    nuova sottocategoria o, senza, fissano la categoria. Restituisce i movimenti spostati;
    commit e riclassificazione sono a carico del chiamante."""
    if target is not None:
        if target.id == source.id:
            raise MergeError("subcategory.merge_same")
        if target.category_id != source.category_id:
            raise MergeError("subcategory.merge_other_category")
    new_id = target.id if target is not None else None
    new_text = str(new_id) if new_id is not None else None
    old_text = str(source.id)

    _move_budgets(session, source, target)

    moved = 0
    # La categoria non cambia: basta la sottocategoria (la FK composta resta valida).
    for model, sub_col in (
        (Transaction, "subcategory_id"),
        (RecurringTransaction, "subcategory_id"),
        (Merchant, "default_subcategory_id"),
    ):
        result = session.execute(
            update(model).where(getattr(model, sub_col) == source.id).values({sub_col: new_id})
        )
        if model is Transaction:
            moved = result.rowcount  # type: ignore[attr-defined]

    pinned = set(
        session.scalars(
            select(ManualOverride.transaction_id).where(
                ManualOverride.field == OverrideField.CATEGORY_ID
            )
        )
    )
    for override in _overrides_using(session, source.id):
        if override.old_value == old_text:
            override.old_value = new_text
        if override.new_value != old_text:
            continue
        override.new_value = new_text
        if new_id is None and override.transaction_id not in pinned:
            # La sottocategoria scelta a mano fissava anche la categoria: senza, lo fa
            # una correzione esplicita della categoria.
            session.add(
                ManualOverride(
                    transaction_id=override.transaction_id,
                    field=OverrideField.CATEGORY_ID,
                    old_value=str(source.category_id),
                    new_value=str(source.category_id),
                )
            )
            pinned.add(override.transaction_id)

    for rule in _rules_using(session, source.id):
        actions = {k: v for k, v in rule.actions.items() if k != "subcategory_id"}
        actions["category_id"] = source.category_id
        if new_id is not None:
            actions["subcategory_id"] = new_id
        rule.actions = actions

    session.flush()
    session.delete(source)
    session.flush()
    return moved
