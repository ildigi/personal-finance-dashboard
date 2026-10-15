from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field

from app.models.enums import CategoryKind
from app.schemas.common import ApiModel, OrmModel

Name = Annotated[str, Field(min_length=1, max_length=100)]


class SubcategoryCreate(ApiModel):
    name: Name
    sort_order: int | None = None


class SubcategoryUpdate(ApiModel):
    name: Name | None = None
    sort_order: int | None = None
    is_archived: bool | None = None


class SubcategoryRead(OrmModel):
    id: int
    category_id: int
    name: str
    code: str | None
    sort_order: int | None
    is_archived: bool


class CategoryCreate(ApiModel):
    name: Name
    kind: CategoryKind = CategoryKind.EXPENSE
    icon: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=32)
    sort_order: int | None = None
    excluded_from_spending: bool = False


class CategoryUpdate(ApiModel):
    name: Name | None = None
    icon: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=32)
    sort_order: int | None = None
    excluded_from_spending: bool | None = None
    is_archived: bool | None = None


class CategoryRead(OrmModel):
    id: int
    name: str
    code: str | None
    kind: CategoryKind
    icon: str | None
    color: str | None
    sort_order: int | None
    is_system: bool
    excluded_from_spending: bool
    is_archived: bool
    subcategories: list[SubcategoryRead]


class IncomeClassificationRead(OrmModel):
    id: int
    code: str
    label: str
    is_system: bool


class CategoryMerge(ApiModel):
    into_id: int


class CategoryMergeResult(BaseModel):
    category: CategoryRead
    moved_transactions: int


class SubcategoryUsage(BaseModel):
    """Cosa usa una sottocategoria: se è tutto zero si elimina subito."""

    transactions: int
    rules: int
    # Versioni del budget, anche chiuse.
    budgets: int
    recurring: int
    merchants: int
    # Correzioni manuali che scelgono (o sostituivano) questa sottocategoria.
    overrides: int
    in_use: bool


class SubcategoryMerge(ApiModel):
    """Destinazione di movimenti, regole e budget; `null` = nessuna sottocategoria (restano
    nella categoria)."""

    into_id: int | None


class SubcategoryMergeResult(BaseModel):
    category: CategoryRead
    moved_transactions: int
