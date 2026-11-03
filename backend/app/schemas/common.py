from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, WithJsonSchema
from pydantic_core import PydanticCustomError


def _reject_float(value: object) -> object:
    # Un float JSON ha già perso precisione: gli importi arrivano come stringhe ("12.50").
    if isinstance(value, float):
        raise PydanticCustomError("amount_as_string", "amounts must be strings")
    return value


_MONEY_PATTERN = r"^-?\d{1,12}(\.\d{1,2})?$"

MoneyIn = Annotated[
    Decimal,
    BeforeValidator(_reject_float),
    Field(max_digits=14, decimal_places=2),
    WithJsonSchema({"type": "string", "pattern": _MONEY_PATTERN, "examples": ["-12.50"]}),
]
RateIn = Annotated[
    Decimal,
    BeforeValidator(_reject_float),
    Field(gt=0, max_digits=20, decimal_places=10),
    WithJsonSchema({"type": "string", "examples": ["1.0850"]}),
]
CurrencyCode = Annotated[str, Field(pattern=r"^[A-Z]{3}$", examples=["EUR"])]
NonEmptyStr = Annotated[str, Field(min_length=1, max_length=500)]


class ApiModel(BaseModel):
    """Base per gli schemi di input: niente campi sconosciuti."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class OrmModel(BaseModel):
    """Base per gli schemi di output costruiti da oggetti ORM."""

    # Nelle risposte i campi con default ci sono sempre: lo schema OpenAPI li dichiara obbligatori.
    model_config = ConfigDict(
        from_attributes=True, json_schema_serialization_defaults_required=True
    )


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int
