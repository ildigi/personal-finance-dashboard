"""Budget e ricorrenze (pagine Budget, Ricorrenze; riquadri in Spese, Entrate, Panoramica)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.models.enums import Frequency, RecurringStatus
from app.schemas.common import ApiModel, MoneyIn, NonEmptyStr, OrmModel

BudgetAmount = Annotated[MoneyIn, Field(gt=0)]
ThresholdPct = Annotated[int, Field(ge=1, le=100)]
BudgetLevel = Literal["ok", "warning", "over"]
MonthKey = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", examples=["2026-10"])]

# --- Budget ---------------------------------------------------------------------------------------


class BudgetCreate(ApiModel):
    category_id: int
    subcategory_id: int | None = None
    amount: BudgetAmount
    alert_threshold_pct: ThresholdPct = 80


class BudgetUpdate(ApiModel):
    """Cambiare l'importo vale dal mese corrente: i mesi passati restano col budget di allora."""

    amount: BudgetAmount | None = None
    alert_threshold_pct: ThresholdPct | None = None


class BudgetMonth(OrmModel):
    month: str
    amount: Decimal | None = Field(description="Nullo = nessun budget in quel mese")
    spent_eur: Decimal


class BudgetStatus(OrmModel):
    id: int
    category_id: int
    subcategory_id: int | None
    name: str
    icon: str | None
    color: str | None
    amount: Decimal
    alert_threshold_pct: int
    valid_from: date
    spent_eur: Decimal
    remaining_eur: Decimal = Field(description="Negativo = sforato")
    used_pct: float
    projected_eur: Decimal = Field(description="Stima a fine mese (nei mesi passati = speso)")
    projected_pct: float
    recurring_expected_eur: Decimal = Field(
        description="Addebiti ricorrenti confermati ancora attesi nel mese"
    )
    level: BudgetLevel = Field(description="ok, warning (soglia di avviso), over (100% o più)")
    projected_over: bool = Field(description="La proiezione supera il budget")
    history: list[BudgetMonth] = Field(description="Ultimi 6 mesi, dal più vecchio")


class BudgetOverview(OrmModel):
    month: str
    date_from: date
    date_to: date
    is_current: bool
    days_elapsed: int
    days_in_month: int
    total_amount: Decimal = Field(description="Somma dei budget (senza doppioni categoria/sotto)")
    total_spent_eur: Decimal
    total_projected_eur: Decimal
    warning_count: int
    over_count: int
    items: list[BudgetStatus]


class BudgetSuggestion(OrmModel):
    """Quanto spendi di solito nella categoria, per scegliere l'importo."""

    average_3m: Decimal | None
    average_6m: Decimal | None
    last_month: Decimal | None
    current_month: Decimal


# --- Ricorrenze --------------------------------------------------------------------------------


class RecurringRead(OrmModel):
    id: int
    name: str
    status: str
    direction: str
    kind: str
    merchant_id: int | None
    category_id: int | None
    subcategory_id: int | None
    frequency: str
    interval_days: int | None
    expected_amount: Decimal
    amount_tolerance_pct: Decimal
    monthly_eur: Decimal = Field(description="Equivalente mensile dell'importo atteso")
    next_expected_date: date | None
    last_seen_date: date | None
    confidence: float | None
    occurrences: int = Field(description="Movimenti collegati")
    is_late: bool = Field(description="Confermata, ma l'ultimo addebito atteso non è arrivato")


class RecurringUpdate(ApiModel):
    """Correggere una proposta la conferma."""

    status: (
        Literal[RecurringStatus.CONFIRMED, RecurringStatus.REJECTED, RecurringStatus.ENDED] | None
    ) = None
    name: NonEmptyStr | None = None
    expected_amount: BudgetAmount | None = None
    frequency: Frequency | None = None
    interval_days: Annotated[int, Field(ge=1, le=730)] | None = None
    amount_tolerance_pct: Annotated[int, Field(ge=0, le=50)] | None = None

    @model_validator(mode="after")
    def _custom_needs_interval(self) -> RecurringUpdate:
        if self.frequency == Frequency.CUSTOM and self.interval_days is None:
            raise ValueError("Con frequenza personalizzata serve interval_days")
        return self


class RecurringSummary(OrmModel):
    """Equivalenti mensili delle ricorrenze confermate."""

    expenses_monthly_eur: Decimal = Field(description="Spese e commissioni ricorrenti")
    subscriptions_monthly_eur: Decimal = Field(description="Solo la categoria Abbonamenti")
    income_monthly_eur: Decimal
    invested_monthly_eur: Decimal = Field(description="Versamenti ricorrenti al broker")
    confirmed_count: int
    suggested_count: int
    late_count: int


class RecurringOverview(OrmModel):
    summary: RecurringSummary
    items: list[RecurringRead]


class UpcomingCharge(OrmModel):
    recurring_id: int
    name: str
    date: date
    amount_eur: Decimal = Field(description="Con segno: negativo = uscita")
    direction: str
    kind: str
    category_id: int | None
    subcategory_id: int | None
    status: str
    overdue: bool = Field(description="Data passata, movimento non ancora arrivato")
