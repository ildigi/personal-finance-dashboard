"""Regole di classificazione: condizioni, azioni, anteprima."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated

from pydantic import (
    BaseModel,
    BeforeValidator,
    Field,
    WithJsonSchema,
    field_validator,
    model_validator,
)
from pydantic_core import PydanticCustomError

from app.models.enums import Direction, RuleOrigin, TransactionKind
from app.schemas.common import ApiModel, OrmModel, _reject_float

AbsAmount = Annotated[
    Decimal,
    BeforeValidator(_reject_float),
    Field(ge=0, max_digits=14, decimal_places=2),
    WithJsonSchema({"type": "string", "pattern": r"^\d{1,12}(\.\d{1,2})?$", "examples": ["9.99"]}),
]
RuleText = Annotated[str, Field(min_length=1, max_length=200)]


class RuleConditions(ApiModel):
    """Condizioni in AND. Gli importi sono in EUR e senza segno: il verso lo dà `direction`."""

    description_contains: RuleText | None = None
    description_regex: RuleText | None = None
    merchant_id: int | None = None
    counterparty_iban: Annotated[str, Field(min_length=5, max_length=40)] | None = None
    account_id: int | None = None
    amount_min: AbsAmount | None = None
    amount_max: AbsAmount | None = None
    amounts: Annotated[list[AbsAmount], Field(min_length=1, max_length=20)] | None = None
    direction: Direction | None = None
    mcc: Annotated[str, Field(pattern=r"^\d{4}$")] | None = None

    @field_validator("description_regex")
    @classmethod
    def _valid_regex(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                re.compile(value)
            except re.error as exc:
                raise PydanticCustomError(
                    "rule.invalid_regex", "invalid regular expression", {"error": str(exc)}
                ) from exc
        return value

    @field_validator("counterparty_iban")
    @classmethod
    def _normalize_iban(cls, value: str | None) -> str | None:
        return value.replace(" ", "").upper() if value else value

    @model_validator(mode="after")
    def _not_empty(self) -> RuleConditions:
        if not self.model_dump(exclude_none=True):
            raise PydanticCustomError("rule.condition_required", "at least one condition")
        if (
            self.amount_min is not None
            and self.amount_max is not None
            and self.amount_min > self.amount_max
        ):
            raise PydanticCustomError("rule.amount_range", "amount_min above amount_max")
        return self


class RuleActions(ApiModel):
    category_id: int | None = None
    subcategory_id: int | None = None
    kind: TransactionKind | None = None
    income_type_id: int | None = None
    merchant_id: int | None = None
    tag_ids: Annotated[list[int], Field(max_length=20)] | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> RuleActions:
        if not self.model_dump(exclude_none=True):
            raise PydanticCustomError("rule.action_required", "at least one action")
        return self


class RuleCreate(ApiModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    priority: int = Field(default=100, ge=0, le=100_000)
    is_active: bool = True
    conditions: RuleConditions
    actions: RuleActions


class RuleUpdate(ApiModel):
    name: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    priority: int | None = Field(default=None, ge=0, le=100_000)
    is_active: bool | None = None
    conditions: RuleConditions | None = None
    actions: RuleActions | None = None


class RuleRead(OrmModel):
    id: int
    code: str | None
    name: str
    priority: int
    is_active: bool
    origin: RuleOrigin
    conditions: RuleConditions
    actions: RuleActions
    match_count: int
    last_matched_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Nessuna corrispondenza da molto tempo (o mai, dopo un periodo di prova).
    is_stale: bool = False


class RuleReorder(ApiModel):
    """Nuovo ordine delle regole (prima = valutata per prima)."""

    rule_ids: Annotated[list[int], Field(min_length=1, max_length=1000)]


class RulePreviewRequest(ApiModel):
    """Prova una regola sui movimenti esistenti senza salvarla.

    Con `rule_id` la regola indicata viene sostituita da questa versione.
    """

    rule_id: int | None = None
    name: str = "Anteprima"
    priority: int = Field(default=100, ge=0, le=100_000)
    conditions: RuleConditions
    actions: RuleActions


class PreviewChange(BaseModel):
    transaction_id: int
    booking_date: date
    description: str
    amount_eur: Decimal
    before_kind: TransactionKind
    before_category_id: int | None
    before_subcategory_id: int | None
    after_kind: TransactionKind
    after_category_id: int | None
    after_subcategory_id: int | None


class RulePreview(BaseModel):
    matched: int = Field(description="Movimenti che soddisfano le condizioni")
    changed: int = Field(description="Movimenti la cui classificazione cambierebbe")
    blocked: int = Field(
        description="Movimenti che soddisfano le condizioni ma restano come sono "
        "(correzione manuale, trasferimento, regola con priorità più alta)"
    )
    changes: list[PreviewChange]


class LearnScope(StrEnum):
    PAST = "past"  # stessa correzione sui movimenti passati simili
    RULE = "rule"  # regola `learned`: passati e futuri


class LearnSuggestion(BaseModel):
    """Dopo una correzione: "applicare 'Abbonamenti › AI' ai movimenti di OpenAI?"."""

    transaction_id: int
    merchant_id: int | None
    subject: str = Field(description="Merchant o controparte a cui si applicherebbe")
    rule_name: str
    similar_count: int = Field(description="Movimenti passati simili con un'altra classificazione")
    conditions: RuleConditions
    actions: RuleActions


class LearnRequest(ApiModel):
    scope: LearnScope


class LearnResult(BaseModel):
    updated: int
    rule: RuleRead | None


class ClassificationStats(BaseModel):
    total: int
    auto_classified: int
    manual: int
    unclassified: int
    auto_pct: float = Field(description="Quota classificata in automatico, 0-100")
    by_source: dict[str, int]
    active_rules: int
    stale_rules: int
    transfer_suggestions: int


class ClassificationRunResult(BaseModel):
    total: int
    changed: int
    transfer_pairs: int
    investment_links: int
    refunds_linked: int
    merchants_created: int
