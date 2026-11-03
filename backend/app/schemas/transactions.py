from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, computed_field, model_validator
from pydantic_core import PydanticCustomError

from app.models.enums import ClassificationSource, TransactionKind, TransactionStatus
from app.schemas.common import (
    ApiModel,
    CurrencyCode,
    MoneyIn,
    NonEmptyStr,
    OrmModel,
    Page,
    RateIn,
)

# Codici delle descrizioni scritte dalla dashboard (vedi `TransactionRead.description_code`).
type DescriptionCode = Literal["fx_cost", "fx_gain", "money_transfer"]
#: Prefisso dell'ID dei movimenti "Costo del cambio" (`ingestion/reconcile.py`).
FX_ADJUSTMENT_PREFIX = "fx-adjust-"
#: Descrizione dei prelievi PayPal senza causale (`integrations/enablebanking/connector.py`).
MONEY_TRANSFER_LABEL = "Trasferimento di denaro"

TransactionSort = Literal["date_desc", "date_asc", "amount_desc", "amount_asc"]


class TransactionCreate(ApiModel):
    """Inserimento manuale (es. carta di credito non disponibile via PSD2)."""

    account_id: int
    booking_date: date
    value_date: date | None = None
    status: TransactionStatus = TransactionStatus.BOOKED
    amount: MoneyIn = Field(description="Con segno: negativo = uscita")
    currency: CurrencyCode = "EUR"
    amount_eur: MoneyIn | None = Field(
        default=None, description="Obbligatorio se la valuta non è EUR"
    )
    fx_rate: RateIn | None = None
    description: NonEmptyStr
    counterparty_name: str | None = Field(default=None, max_length=200)
    kind: TransactionKind | None = Field(
        default=None, description="Se assente: expense per le uscite, income per le entrate"
    )
    category_id: int | None = None
    subcategory_id: int | None = None
    income_type_id: int | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _check_eur(self) -> TransactionCreate:
        if self.currency != "EUR" and self.amount_eur is None:
            raise PydanticCustomError("transaction.amount_eur_required", "amount_eur required")
        return self


class TransactionUpdate(ApiModel):
    """Correzione di un movimento.

    I campi di classificazione si possono correggere su tutti i movimenti e la
    correzione viene registrata in `manual_overrides`. Date, importi e descrizione
    sono modificabili solo sui movimenti inseriti a mano.
    """

    # Classificazione (tutti i movimenti)
    kind: TransactionKind | None = None
    category_id: int | None = None
    subcategory_id: int | None = None
    income_type_id: int | None = None
    merchant_id: int | None = None
    notes: str | None = Field(default=None, max_length=2000)

    # Dati del movimento (solo inserimenti manuali)
    booking_date: date | None = None
    value_date: date | None = None
    status: TransactionStatus | None = None
    amount: MoneyIn | None = None
    currency: CurrencyCode | None = None
    amount_eur: MoneyIn | None = None
    fx_rate: RateIn | None = None
    description: NonEmptyStr | None = None
    counterparty_name: str | None = Field(default=None, max_length=200)


class TagRead(OrmModel):
    id: int
    name: str
    color: str | None


class TransactionRead(OrmModel):
    id: int
    account_id: int
    external_id: str | None
    booking_date: date
    value_date: date | None
    status: TransactionStatus
    amount: Decimal
    currency: str
    amount_eur: Decimal
    original_amount: Decimal | None
    original_currency: str | None
    fx_rate: Decimal | None
    description_raw: str
    description_clean: str
    counterparty_name: str | None
    counterparty_iban: str | None
    merchant_id: int | None
    merchant_name: str | None
    kind: TransactionKind
    category_id: int | None
    subcategory_id: int | None
    income_type_id: int | None
    classification_source: ClassificationSource
    rule_id: int | None
    classification_reason: str | None
    classification_params: dict[str, Any] | None
    classification_note: str | None
    transfer_pair_id: int | None
    recurring_id: int | None
    refund_of_id: int | None
    notes: str | None
    is_manual: bool
    tags: list[TagRead]
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def description_code(self) -> DescriptionCode | None:
        """Movimenti scritti dalla dashboard o col testo scelto da lei: il frontend ne mostra la
        descrizione nella lingua dell'utente. La descrizione salvata non cambia (fa parte
        dell'impronta anti-doppioni ed è riconosciuta dalla regola `fx_conversion_cost`)."""
        if (self.external_id or "").startswith(FX_ADJUSTMENT_PREFIX):
            return "fx_cost" if self.amount < 0 else "fx_gain"
        if self.description_raw == MONEY_TRANSFER_LABEL:
            return "money_transfer"
        return None


class ManualOverrideRead(OrmModel):
    field: str
    old_value: str | None
    new_value: str | None
    updated_at: datetime


class TransactionDetail(TransactionRead):
    """Dettaglio: include il dato grezzo del provider e le correzioni manuali."""

    provider_category: str | None
    mcc: str | None
    raw: dict[str, Any] | None
    overrides: list[ManualOverrideRead] = Field(default_factory=list)


class TransactionTotals(BaseModel):
    """Totali dell'intero filtro (non solo della pagina), in EUR."""

    count: int
    inflow_eur: Decimal
    outflow_eur: Decimal


class TransactionPage(Page[TransactionRead]):
    totals: TransactionTotals


class TransactionPair(ApiModel):
    """Due movimenti da abbinare (o da non abbinare più) come trasferimento interno."""

    out_id: int = Field(description="Il movimento in uscita")
    in_id: int = Field(description="Il movimento in entrata")


class TransferSuggestion(BaseModel):
    """Abbinamento possibile ma senza indizi: da confermare o scartare."""

    outflow: TransactionRead
    inflow: TransactionRead


class TransactionBulkUpdate(ApiModel):
    """Stessa correzione su più movimenti (registrata come correzione manuale)."""

    ids: Annotated[list[int], Field(min_length=1, max_length=500)]
    kind: TransactionKind | None = None
    category_id: int | None = None
    subcategory_id: int | None = None
    income_type_id: int | None = None
    add_tag_ids: Annotated[list[int], Field(max_length=20)] = Field(default_factory=list)
    remove_tag_ids: Annotated[list[int], Field(max_length=20)] = Field(default_factory=list)


class BulkResult(BaseModel):
    updated: int


class TagCreate(ApiModel):
    name: Annotated[str, Field(min_length=1, max_length=50)]
    color: str | None = Field(default=None, max_length=32)
