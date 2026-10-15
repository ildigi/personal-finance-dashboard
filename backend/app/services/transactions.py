"""Logica dei movimenti: creazione manuale e correzioni con override persistenti."""

from __future__ import annotations

import hashlib
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classification.text import clean_description, collapse_whitespace
from app.models import (
    Account,
    Category,
    IncomeClassification,
    ManualOverride,
    Merchant,
    Subcategory,
    Transaction,
)
from app.models.enums import ClassificationSource, OverrideField, TransactionKind
from app.schemas.transactions import TransactionCreate, TransactionUpdate

CLASSIFICATION_FIELDS: tuple[OverrideField, ...] = (
    OverrideField.KIND,
    OverrideField.CATEGORY_ID,
    OverrideField.SUBCATEGORY_ID,
    OverrideField.INCOME_TYPE_ID,
    OverrideField.MERCHANT_ID,
)
MANUAL_ONLY_FIELDS = frozenset(
    {
        "booking_date",
        "value_date",
        "status",
        "amount",
        "currency",
        "amount_eur",
        "fx_rate",
        "description",
        "counterparty_name",
    }
)
NON_NULLABLE_FIELDS = frozenset(
    {"kind", "booking_date", "status", "amount", "currency", "amount_eur", "description"}
)


class TransactionError(ValueError):
    """Errore di validazione applicativa (tradotto in 422 dall'API)."""


class TransactionConflictError(Exception):
    """Operazione non consentita sullo stato attuale (tradotta in 409)."""


def compute_dedupe_hash(
    account_id: int, booking_date: date, amount: Decimal, currency: str, description: str
) -> str:
    """Impronta stabile di un movimento, per riconoscere i doppioni tra sync diverse."""
    key = "|".join(
        [
            str(account_id),
            booking_date.isoformat(),
            f"{amount:.2f}",
            currency.upper(),
            # Solo spazi: l'impronta non deve cambiare se migliora la pulizia delle descrizioni.
            collapse_whitespace(description).casefold(),
        ]
    )
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def default_kind(amount: Decimal) -> TransactionKind:
    if amount < 0:
        return TransactionKind.EXPENSE
    if amount > 0:
        return TransactionKind.INCOME
    return TransactionKind.OTHER


def _resolve_category(
    session: Session, category_id: int | None, subcategory_id: int | None
) -> tuple[int | None, int | None]:
    """Valida categoria/sottocategoria e ricava la categoria dalla sottocategoria."""
    if subcategory_id is not None:
        sub = session.get(Subcategory, subcategory_id)
        if sub is None:
            raise TransactionError(f"Sottocategoria {subcategory_id} inesistente")
        if category_id is not None and sub.category_id != category_id:
            raise TransactionError("La sottocategoria non appartiene alla categoria indicata")
        return sub.category_id, subcategory_id
    if category_id is not None and session.get(Category, category_id) is None:
        raise TransactionError(f"Categoria {category_id} inesistente")
    return category_id, None


def _ensure_exists(session: Session, model: type[object], pk: int | None, label: str) -> None:
    if pk is not None and session.get(model, pk) is None:
        raise TransactionError(f"{label} {pk} inesistente")


def create_manual_transaction(session: Session, data: TransactionCreate) -> Transaction:
    account = session.get(Account, data.account_id)
    if account is None:
        raise TransactionError(f"Conto {data.account_id} inesistente")

    category_id, subcategory_id = _resolve_category(session, data.category_id, data.subcategory_id)
    _ensure_exists(session, IncomeClassification, data.income_type_id, "Tipologia di entrata")

    amount_eur = data.amount if data.currency == "EUR" else data.amount_eur
    if amount_eur is None:
        raise TransactionError("amount_eur è obbligatorio per i movimenti non in EUR")

    explicit = data.kind is not None or category_id is not None
    tx = Transaction(
        account_id=account.id,
        external_id=None,
        dedupe_hash=compute_dedupe_hash(
            account.id, data.booking_date, data.amount, data.currency, data.description
        ),
        booking_date=data.booking_date,
        value_date=data.value_date,
        status=data.status,
        amount=data.amount,
        currency=data.currency,
        amount_eur=amount_eur,
        fx_rate=data.fx_rate,
        description_raw=data.description,
        description_clean=clean_description(data.description),
        counterparty_name=data.counterparty_name,
        kind=data.kind or default_kind(data.amount),
        category_id=category_id,
        subcategory_id=subcategory_id,
        income_type_id=data.income_type_id,
        classification_source=(
            ClassificationSource.MANUAL if explicit else ClassificationSource.NONE
        ),
        notes=data.notes,
        is_manual=True,
    )
    session.add(tx)
    session.flush()
    return tx


def _as_text(value: object) -> str | None:
    return None if value is None else str(value)


def record_override(
    session: Session, tx: Transaction, field: str, old: object, new: object
) -> None:
    """Registra la correzione; se il campo era già stato corretto conserva il valore originale."""
    override = session.scalar(
        select(ManualOverride).where(
            ManualOverride.transaction_id == tx.id, ManualOverride.field == field
        )
    )
    if override is None:
        session.add(
            ManualOverride(
                transaction_id=tx.id,
                field=field,
                old_value=_as_text(old),
                new_value=_as_text(new),
            )
        )
    else:
        override.new_value = _as_text(new)


def _find_override(session: Session, tx: Transaction, field: str) -> ManualOverride | None:
    return session.scalar(
        select(ManualOverride).where(
            ManualOverride.transaction_id == tx.id, ManualOverride.field == field
        )
    )


#: Correzioni che toccano la classificazione (le note no): il ripristino le toglie tutte.
RESETTABLE_FIELDS = frozenset(
    {*CLASSIFICATION_FIELDS, OverrideField.TRANSFER_PAIR_ID, OverrideField.REFUND_OF_ID}
)


def classification_override_count(session: Session, tx_ids: list[int]) -> int:
    return len(
        session.scalars(
            select(ManualOverride.id).where(
                ManualOverride.transaction_id.in_(tx_ids),
                ManualOverride.field.in_([f.value for f in RESETTABLE_FIELDS]),
            )
        ).all()
    )


def reset_classification(session: Session, tx: Transaction) -> int:
    """Toglie le correzioni di classificazione (le note restano). Il chiamante deve poi
    riclassificare: il movimento torna a regole, merchant e riconoscimento automatico."""
    removed = 0
    for override in session.scalars(
        select(ManualOverride).where(
            ManualOverride.transaction_id == tx.id,
            ManualOverride.field.in_([f.value for f in RESETTABLE_FIELDS]),
        )
    ):
        session.delete(override)
        removed += 1
    if tx.classification_source == ClassificationSource.MANUAL:
        # Anche i movimenti inseriti a mano tornano alla classificazione automatica.
        tx.classification_source = ClassificationSource.NONE
        tx.classification_note = None
    session.flush()
    return removed


def update_transaction(session: Session, tx: Transaction, data: TransactionUpdate) -> Transaction:
    changes = data.model_dump(exclude_unset=True)

    for field in NON_NULLABLE_FIELDS & changes.keys():
        if changes[field] is None:
            raise TransactionError(f"Il campo {field} non può essere vuoto")

    manual_only = MANUAL_ONLY_FIELDS & changes.keys()
    if manual_only and not tx.is_manual:
        raise TransactionConflictError(
            "Date, importi e descrizione dei movimenti sincronizzati non sono modificabili: "
            f"{', '.join(sorted(manual_only))}"
        )

    # --- Categoria / sottocategoria -------------------------------------------------
    if "category_id" in changes or "subcategory_id" in changes:
        if "subcategory_id" in changes:
            new_sub = changes["subcategory_id"]
            # Sottocategoria senza categoria: la categoria si ricava dalla sottocategoria.
            fallback_cat = None if new_sub is not None else tx.category_id
            new_cat = changes.get("category_id", fallback_cat)
        else:
            # Cambio di sola categoria: la sottocategoria resta solo se compatibile.
            new_cat = changes["category_id"]
            current_sub = session.get(Subcategory, tx.subcategory_id) if tx.subcategory_id else None
            new_sub = current_sub.id if current_sub and current_sub.category_id == new_cat else None
        changes["category_id"], changes["subcategory_id"] = _resolve_category(
            session, new_cat, new_sub
        )

    if "income_type_id" in changes:
        _ensure_exists(session, IncomeClassification, changes["income_type_id"], "Tipologia")
    if "merchant_id" in changes:
        _ensure_exists(session, Merchant, changes["merchant_id"], "Merchant")

    # --- Classificazione e note: correzioni persistenti --------------------------------
    # Prima si calcolano le differenze e si registrano gli override, poi si applicano
    # i valori: un autoflush a metà (es. categoria nuova + sottocategoria vecchia)
    # violerebbe la FK composta.
    diffs = {
        field: (getattr(tx, field), changes[field])
        for field in (*CLASSIFICATION_FIELDS, OverrideField.NOTES)
        if field in changes and getattr(tx, field) != changes[field]
    }
    if not tx.is_manual:
        for field, (old, new) in diffs.items():
            existing = _find_override(session, tx, field)
            if existing is not None and existing.old_value == _as_text(new):
                # Tornare al valore di prima della correzione la annulla.
                session.delete(existing)
            else:
                record_override(session, tx, field, old, new)
    for field, (_, new) in diffs.items():
        setattr(tx, field, new)
    classification_changed = any(field in CLASSIFICATION_FIELDS for field in diffs)

    if classification_changed:
        tx.classification_source = ClassificationSource.MANUAL
        tx.rule_id = None
        tx.classification_note = "Correzione manuale"

    # --- Dati del movimento (solo manuali) -------------------------------------------
    if manual_only:
        if "description" in changes:
            tx.description_raw = changes["description"]
            tx.description_clean = clean_description(changes["description"])
        for field in manual_only - {"description"}:
            setattr(tx, field, changes[field])
        if tx.currency == "EUR":
            tx.amount_eur = tx.amount
        elif changes.keys() & {"amount", "currency"} and "amount_eur" not in changes:
            raise TransactionError("Per i movimenti non in EUR va aggiornato anche amount_eur")
        tx.dedupe_hash = compute_dedupe_hash(
            tx.account_id, tx.booking_date, tx.amount, tx.currency, tx.description_raw
        )

    session.flush()
    return tx
