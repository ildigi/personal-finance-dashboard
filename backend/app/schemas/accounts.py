from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.models.enums import AccountType, Provider, SourceStatus
from app.schemas.common import ApiModel, CurrencyCode, NonEmptyStr, OrmModel

# --- Sorgenti -------------------------------------------------------------------


class SourceCreate(ApiModel):
    provider: Provider
    institution: NonEmptyStr
    display_name: NonEmptyStr
    status: SourceStatus = SourceStatus.ACTIVE
    consent_expires_at: datetime | None = None


class SourceUpdate(ApiModel):
    display_name: NonEmptyStr | None = None
    status: SourceStatus | None = None
    consent_expires_at: datetime | None = None


class SourceRead(OrmModel):
    """Nessun riferimento a segreti o sessioni cifrate nell'output."""

    id: int
    provider: Provider
    institution: str
    display_name: str
    status: SourceStatus
    consent_expires_at: datetime | None
    last_sync_at: datetime | None
    created_at: datetime
    updated_at: datetime


# --- Conti ----------------------------------------------------------------------


class AccountCreate(ApiModel):
    source_id: int
    external_id: NonEmptyStr
    name: NonEmptyStr
    type: AccountType
    currency: CurrencyCode = "EUR"
    iban: str | None = Field(default=None, max_length=34)
    institution: NonEmptyStr
    is_active: bool = True
    include_in_net_worth: bool = True
    color: str | None = Field(default=None, max_length=32)


class AccountUpdate(ApiModel):
    name: NonEmptyStr | None = None
    is_active: bool | None = None
    include_in_net_worth: bool | None = None
    color: str | None = Field(default=None, max_length=32)


class AccountRead(OrmModel):
    id: int
    source_id: int
    external_id: str
    name: str
    type: AccountType
    currency: str
    iban: str | None
    institution: str
    is_active: bool
    include_in_net_worth: bool
    color: str | None
    created_at: datetime
    updated_at: datetime
    #: Ultimo saldo noto: il disponibile se la banca lo dà, altrimenti il contabile
    #: (None se il provider non l'ha ancora fornito).
    balance: Decimal | None = None
    balance_as_of: date | None = None
    balance_type: Literal["available", "booked"] | None = None
