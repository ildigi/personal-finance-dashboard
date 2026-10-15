from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field

from app.models.enums import MerchantOrigin
from app.schemas.common import ApiModel, OrmModel, Page

Alias = Annotated[str, Field(min_length=2, max_length=100)]


class MerchantRead(OrmModel):
    id: int
    name: str
    normalized_key: str
    aliases: list[str]
    default_category_id: int | None
    default_subcategory_id: int | None
    origin: MerchantOrigin


class MerchantWithStats(MerchantRead):
    transaction_count: int = 0
    spent_eur: Decimal = Field(default=Decimal(0), description="Spese reali, in positivo")
    last_date: date | None = None


class MerchantPage(Page[MerchantWithStats]):
    pass


class MerchantUpdate(ApiModel):
    name: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    aliases: Annotated[list[Alias], Field(max_length=50)] | None = None
    default_category_id: int | None = None
    default_subcategory_id: int | None = None


class MerchantMerge(ApiModel):
    into_id: int = Field(description="Il merchant che resta")


class MergeResult(BaseModel):
    merchant: MerchantRead
    moved_transactions: int
