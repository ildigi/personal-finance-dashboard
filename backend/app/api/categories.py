from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import ColumnElement, exists, select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, apply_patch, get_or_404
from app.classification.engine import classify_all
from app.models import (
    Budget,
    Category,
    IncomeClassification,
    Merchant,
    RecurringTransaction,
    Subcategory,
    Transaction,
    TransactionRule,
)
from app.schemas.categories import (
    CategoryCreate,
    CategoryMerge,
    CategoryMergeResult,
    CategoryRead,
    CategoryUpdate,
    IncomeClassificationRead,
    SubcategoryCreate,
    SubcategoryMerge,
    SubcategoryMergeResult,
    SubcategoryRead,
    SubcategoryUpdate,
    SubcategoryUsage,
)
from app.services.categories import (
    MergeError,
    merge_categories,
    merge_subcategory,
    subcategory_usage,
)

router = APIRouter(tags=["categories"])

_IN_USE = (
    "è usata da movimenti, budget, ricorrenze, merchant o regole: "
    "archiviala o uniscila a un'altra invece di eliminarla"
)


def _is_used(session: DbSession, *conditions: ColumnElement[bool]) -> bool:
    return any(session.scalar(select(exists().where(cond))) for cond in conditions)


def _used_by_rules(session: DbSession, field: str, value: int) -> bool:
    return any(r.actions.get(field) == value for r in session.scalars(select(TransactionRule)))


# --- Categorie ------------------------------------------------------------------


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(session: DbSession, include_archived: bool = False) -> list[CategoryRead]:
    query = (
        select(Category)
        .options(selectinload(Category.subcategories))
        .order_by(Category.sort_order.nulls_last(), Category.name)
    )
    if not include_archived:
        query = query.where(Category.is_archived.is_(False))

    result = []
    for category in session.scalars(query):
        item = CategoryRead.model_validate(category)
        if not include_archived:
            item.subcategories = [s for s in item.subcategories if not s.is_archived]
        result.append(item)
    return result


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, session: DbSession) -> Category:
    category = Category(**payload.model_dump(), subcategories=[])
    session.add(category)
    session.commit()
    return category


@router.get("/categories/{category_id}", response_model=CategoryRead)
def get_category(category_id: int, session: DbSession) -> Category:
    return get_or_404(session, Category, category_id, "Categoria")


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(category_id: int, payload: CategoryUpdate, session: DbSession) -> Category:
    category = get_or_404(session, Category, category_id, "Categoria")
    if category.is_system and payload.is_archived:
        raise HTTPException(status.HTTP_409_CONFLICT, "Le categorie di sistema non si archiviano")
    apply_patch(
        category,
        payload,
        non_nullable=frozenset({"name", "excluded_from_spending", "is_archived"}),
    )
    session.commit()
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, session: DbSession) -> Response:
    category = get_or_404(session, Category, category_id, "Categoria")
    if category.is_system:
        raise HTTPException(status.HTTP_409_CONFLICT, "Le categorie di sistema non si eliminano")
    if _is_used(
        session,
        Transaction.category_id == category.id,
        Budget.category_id == category.id,
        RecurringTransaction.category_id == category.id,
        Merchant.default_category_id == category.id,
    ) or _used_by_rules(session, "category_id", category.id):
        raise HTTPException(status.HTTP_409_CONFLICT, f"La categoria {_IN_USE}")
    for sub in list(category.subcategories):
        session.delete(sub)
    session.flush()
    session.delete(category)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/categories/{category_id}/merge", response_model=CategoryMergeResult)
def merge_category(
    category_id: int, payload: CategoryMerge, session: DbSession
) -> CategoryMergeResult:
    """Unisce questa categoria in un'altra: movimenti, budget, merchant e regole passano
    alla destinazione; le sottocategorie confluiscono in quelle omonime (o vengono create)."""
    source = get_or_404(session, Category, category_id, "Categoria")
    target = get_or_404(session, Category, payload.into_id, "Categoria")
    try:
        moved = merge_categories(session, source, target)
    except MergeError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    classify_all(session)
    session.commit()
    session.refresh(target)
    return CategoryMergeResult(
        category=CategoryRead.model_validate(target), moved_transactions=moved
    )


# --- Sottocategorie -------------------------------------------------------------


@router.post(
    "/categories/{category_id}/subcategories",
    response_model=SubcategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_subcategory(
    category_id: int, payload: SubcategoryCreate, session: DbSession
) -> Subcategory:
    get_or_404(session, Category, category_id, "Categoria")
    sub = Subcategory(category_id=category_id, **payload.model_dump())
    session.add(sub)
    session.commit()
    return sub


@router.patch("/subcategories/{subcategory_id}", response_model=SubcategoryRead)
def update_subcategory(
    subcategory_id: int, payload: SubcategoryUpdate, session: DbSession
) -> Subcategory:
    sub = get_or_404(session, Subcategory, subcategory_id, "Sottocategoria")
    apply_patch(sub, payload, non_nullable=frozenset({"name", "is_archived"}))
    session.commit()
    return sub


@router.get("/subcategories/{subcategory_id}/usage", response_model=SubcategoryUsage)
def get_subcategory_usage(subcategory_id: int, session: DbSession) -> SubcategoryUsage:
    sub = get_or_404(session, Subcategory, subcategory_id, "Sottocategoria")
    usage = subcategory_usage(session, sub)
    return SubcategoryUsage(**asdict(usage), in_use=usage.in_use)


@router.delete("/subcategories/{subcategory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subcategory(subcategory_id: int, session: DbSession) -> Response:
    """Solo se nulla la usa; altrimenti `POST /subcategories/{id}/merge`."""
    sub = get_or_404(session, Subcategory, subcategory_id, "Sottocategoria")
    if subcategory_usage(session, sub).in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "La sottocategoria è usata da movimenti, budget, ricorrenze, merchant, regole o "
            "correzioni: sposta prima ciò che la usa su un'altra sottocategoria",
        )
    session.delete(sub)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/subcategories/{subcategory_id}/merge", response_model=SubcategoryMergeResult)
def merge_subcategory_into(
    subcategory_id: int, payload: SubcategoryMerge, session: DbSession
) -> SubcategoryMergeResult:
    """Elimina la sottocategoria spostando movimenti, regole, budget, ricorrenze, merchant e
    correzioni su un'altra della stessa categoria (o su nessuna), poi riclassifica."""
    source = get_or_404(session, Subcategory, subcategory_id, "Sottocategoria")
    target = (
        get_or_404(session, Subcategory, payload.into_id, "Sottocategoria")
        if payload.into_id is not None
        else None
    )
    category_id = source.category_id
    try:
        moved = merge_subcategory(session, source, target)
    except MergeError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    classify_all(session)
    session.commit()
    category = get_or_404(session, Category, category_id, "Categoria")
    session.refresh(category)
    return SubcategoryMergeResult(
        category=CategoryRead.model_validate(category), moved_transactions=moved
    )


# --- Tipologie di entrata -------------------------------------------------------


@router.get("/income-types", response_model=list[IncomeClassificationRead])
def list_income_types(session: DbSession) -> list[IncomeClassification]:
    return list(session.scalars(select(IncomeClassification).order_by(IncomeClassification.id)))
