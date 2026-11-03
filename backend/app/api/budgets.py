"""Budget mensili (pagina Budget, avvisi nella barra laterale e in Panoramica)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.api.deps import DbSession, get_or_404
from app.core.messages import http_error
from app.models import Budget
from app.schemas.planning import (
    BudgetCreate,
    BudgetOverview,
    BudgetStatus,
    BudgetSuggestion,
    BudgetUpdate,
    MonthKey,
)
from app.services.budgets import (
    BudgetConflictError,
    BudgetError,
    budget_overview,
    budget_status,
    create_budget,
    end_budget,
    parse_month,
    suggestion,
    update_budget,
    validate_scope,
)
from app.services.dates import today_rome

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _http(exc: BudgetError | BudgetConflictError) -> HTTPException:
    code = (
        status.HTTP_409_CONFLICT
        if isinstance(exc, BudgetConflictError)
        else status.HTTP_422_UNPROCESSABLE_CONTENT
    )
    return http_error(code, exc)


@router.get("", response_model=BudgetOverview)
def get_budgets(
    session: DbSession,
    month: Annotated[MonthKey | None, Query(description="AAAA-MM, default il corrente")] = None,
) -> BudgetOverview:
    """Speso contro budget nel mese, proiezione a fine mese, avvisi, storico di 6 mesi."""
    today = today_rome()
    try:
        return budget_overview(session, parse_month(month) if month else today, today)
    except BudgetError as exc:
        raise _http(exc) from exc


@router.get("/suggestion", response_model=BudgetSuggestion)
def get_suggestion(
    session: DbSession, category_id: int, subcategory_id: int | None = None
) -> BudgetSuggestion:
    """Spesa media della categoria, per scegliere l'importo del budget."""
    try:
        validate_scope(session, category_id, subcategory_id)
    except BudgetError as exc:
        raise _http(exc) from exc
    return suggestion(session, category_id, subcategory_id, today_rome())


@router.post("", response_model=BudgetStatus, status_code=status.HTTP_201_CREATED)
def post_budget(payload: BudgetCreate, session: DbSession) -> BudgetStatus:
    today = today_rome()
    try:
        budget = create_budget(session, payload, today)
    except (BudgetError, BudgetConflictError) as exc:
        raise _http(exc) from exc
    session.commit()
    return budget_status(session, budget.id, today)


@router.patch("/{budget_id}", response_model=BudgetStatus)
def patch_budget(budget_id: int, payload: BudgetUpdate, session: DbSession) -> BudgetStatus:
    """Il nuovo importo vale dal mese corrente: la risposta può avere un `id` diverso."""
    today = today_rome()
    budget = get_or_404(session, Budget, budget_id)
    try:
        current = update_budget(session, budget, payload, today)
    except BudgetConflictError as exc:
        raise _http(exc) from exc
    session.commit()
    return budget_status(session, current.id, today)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, session: DbSession) -> Response:
    """Toglie il budget dal mese corrente in poi; i mesi passati restano nello storico."""
    budget = get_or_404(session, Budget, budget_id)
    end_budget(session, budget, today_rome())
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
