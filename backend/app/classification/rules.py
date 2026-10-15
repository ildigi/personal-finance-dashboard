"""Valutazione delle regole di classificazione (condizioni in AND)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

from app.models import Transaction, TransactionRule
from app.models.enums import Direction, RuleOrigin
from app.schemas.rules import RuleActions, RuleConditions

#: Id fittizio della regola in anteprima (non ancora salvata).
PREVIEW_RULE_ID = -1


@dataclass
class CompiledRule:
    id: int
    name: str
    origin: str
    priority: int
    conditions: RuleConditions
    actions: RuleActions
    _contains: str | None = None
    _regex: re.Pattern[str] | None = None
    _amounts: frozenset[Decimal] | None = None

    def __post_init__(self) -> None:
        c = self.conditions
        self._contains = c.description_contains.casefold() if c.description_contains else None
        self._regex = (
            re.compile(c.description_regex, re.IGNORECASE) if c.description_regex else None
        )
        self._amounts = frozenset(c.amounts) if c.amounts else None

    @classmethod
    def from_model(cls, rule: TransactionRule) -> CompiledRule:
        return cls(
            id=rule.id,
            name=rule.name,
            origin=rule.origin,
            priority=rule.priority,
            conditions=RuleConditions.model_validate(rule.conditions),
            actions=RuleActions.model_validate(rule.actions),
        )

    @property
    def sort_key(self) -> tuple[int, int, int]:
        # Prima le tue regole (user e learned), poi quelle di sistema; poi la priorità.
        return (int(self.origin == RuleOrigin.SEED), self.priority, self.id)

    def matches(self, tx: Transaction, merchant_id: int | None) -> bool:
        c = self.conditions
        amount = tx.amount_eur
        if c.direction is not None:
            outflow = amount < 0
            if outflow != (c.direction == Direction.OUT) or amount == 0:
                return False
        absolute = abs(amount)
        if c.amount_min is not None and absolute < c.amount_min:
            return False
        if c.amount_max is not None and absolute > c.amount_max:
            return False
        if self._amounts is not None and absolute not in self._amounts:
            return False
        if c.account_id is not None and tx.account_id != c.account_id:
            return False
        if c.merchant_id is not None and merchant_id != c.merchant_id:
            return False
        if c.mcc is not None and tx.mcc != c.mcc:
            return False
        if c.counterparty_iban is not None and (
            (tx.counterparty_iban or "").replace(" ", "").upper() != c.counterparty_iban
        ):
            return False
        if self._contains is not None or self._regex is not None:
            haystack = " ".join(
                filter(None, (tx.description_raw, tx.description_clean, tx.counterparty_name))
            )
            if self._contains is not None and self._contains not in haystack.casefold():
                return False
            if self._regex is not None and not self._regex.search(haystack):
                return False
        return True


def first_match(
    rules: list[CompiledRule], tx: Transaction, merchant_id: int | None
) -> CompiledRule | None:
    """Le regole sono già ordinate per `sort_key`: vince la prima che corrisponde."""
    for rule in rules:
        if rule.matches(tx, merchant_id):
            return rule
    return None
