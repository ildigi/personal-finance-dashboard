"""Messaggi per l'interfaccia come codici con parametri (ADR 0006).

Il backend non manda frasi: manda un codice stabile e i suoi parametri, e il frontend sceglie
il testo nella lingua dell'utente. Vale per gli errori delle API, per le eccezioni che finiscono
nei log di sincronizzazione e per il "perché" della classificazione.

Ogni codice usato sta in `MESSAGE_CODES`: l'elenco è esportato nello schema OpenAPI
(`x-message-codes`) e un test del frontend controlla che ognuno abbia una traduzione.
"""

from __future__ import annotations

from fastapi import HTTPException

type ParamValue = str | int | float | None
type Params = dict[str, ParamValue]

MESSAGE_CODES: frozenset[str] = frozenset(
    {
        # --- Generici ---------------------------------------------------------------------
        "not_found",
        "conflict",
        "field_required",
        "unexpected",
        "amount_as_string",
        "range.invalid",
        "range.too_long",
        # --- Accesso ----------------------------------------------------------------------
        "auth.locked",
        "auth.not_configured",
        "auth.not_configured_setup",
        "auth.invalid_credentials",
        "auth.required",
        "auth.foreign_origin",
        # --- Conti, categorie, merchant ---------------------------------------------------
        "account.has_transactions",
        "category.not_found",
        "category.system_not_archivable",
        "category.system_not_deletable",
        "category.system_not_mergeable",
        "category.in_use",
        "category.merge_same",
        "subcategory.not_found",
        "subcategory.wrong_category",
        "subcategory.in_use",
        "subcategory.merge_same",
        "subcategory.merge_other_category",
        "merchant.name_required",
        "merchant.merge_same",
        # --- Movimenti --------------------------------------------------------------------
        "transaction.some_missing",
        "transaction.tags_unknown",
        "transaction.no_corrections",
        "transaction.synced_not_deletable",
        "transaction.synced_fields",
        "transaction.amount_eur_required",
        "transaction.amount_eur_update",
        "transfer.needs_out_and_in",
        "transfer.same_account",
        # --- Regole -----------------------------------------------------------------------
        "rule.system_not_editable",
        "rule.system_not_deletable",
        "rule.unknown",
        "rule.system_order",
        "rule.invalid_regex",
        "rule.condition_required",
        "rule.amount_range",
        "rule.action_required",
        # --- Budget e ricorrenze ----------------------------------------------------------
        "budget.month_not_started",
        "budget.expense_only",
        "budget.exists",
        "budget.ended",
        "recurring.interval_required",
        # --- Investimenti -----------------------------------------------------------------
        "portfolio.not_found",
        "portfolio.start_in_future",
        "live.trading212_only",
        "live.source_disabled",
        "live.sync_running",
        # --- Sorgenti e sincronizzazione --------------------------------------------------
        "source.disabled",
        "source.mock_in_production",
        "source.unknown_mock",
        "source.manual_not_syncable",
        "source.unknown_provider",
        "fx.ecb_unavailable",
        "fx.ecb_unreadable",
        "fx.rate_missing",
        # --- Banche (Enable Banking) ------------------------------------------------------
        "bank.not_connected",
        "bank.provider_error",
        "bank.authorization_incomplete",
        "bank.authorize_target",
        "bank.unavailable",
        "bank.no_redirect",
        "bank.flow_expired",
        "bank.not_authorized",
        "bank.session_unreadable",
        "bank.consent_expired",
        "bank.consent_revoked",
        "bank.access_denied",
        "bank.app_unauthorized",
        "bank.rate_limited",
        "bank.period_rejected",
        "bank.http_error",
        "bank.unreachable",
        "bank.bad_response",
        "bank.too_many_pages",
        "bank.endpoint_forbidden",
        "bank.credentials_missing",
        "bank.credentials_invalid",
        "bank.private_key_missing",
        "bank.invalid_amount",
        "bank.account_not_in_consent",
        # --- Trading 212 ------------------------------------------------------------------
        "broker.credentials_missing",
        "broker.credentials_invalid",
        "broker.key_invalid",
        "broker.permission_missing",
        "broker.not_found",
        "broker.http_error",
        "broker.unreachable",
        "broker.unavailable",
        "broker.bad_response",
        "broker.too_many_pages",
        "broker.endpoint_forbidden",
        "broker.not_eur",
        # --- Perché della classificazione -------------------------------------------------
        "reason.manual",
        "reason.rule",
        "reason.merchant_default",
        "reason.mcc",
        "reason.provider_category",
        "reason.transfer_own_iban",
        "reason.transfer_keyword",
        "reason.transfer_rule",
        "reason.transfer_manual",
        "reason.transfer_paypal_withdrawal",
        "reason.own_counterparty",
        "reason.paid_with_paypal",
        "reason.investment_match",
        "reason.travel_away",
        "reason.travel_day",
        "reason.refund_of",
        "reason.refund_keyword",
        "reason.salary_recurring",
        "reason.cashback_provider",
        "reason.dividend_keyword",
        "reason.transfer_received",
    }
)


def _check(code: str) -> str:
    if code not in MESSAGE_CODES:
        raise ValueError(f"Codice di messaggio sconosciuto: {code}")
    return code


class AppError(Exception):
    """Errore che arriva all'utente: un codice di `MESSAGE_CODES` e i suoi parametri."""

    def __init__(self, code: str, /, **params: ParamValue) -> None:
        super().__init__(code)
        self.code = _check(code)
        self.params: Params = params

    def __str__(self) -> str:
        return f"{self.code} {self.params}" if self.params else self.code


def http_error(status_code: int, error: str | AppError, /, **params: ParamValue) -> HTTPException:
    """Risposta d'errore `{"detail": {"code": ..., "params": {...}}}`."""
    if isinstance(error, AppError):
        code, params = error.code, {**error.params, **params}
    else:
        code = _check(error)
    return HTTPException(status_code, detail={"code": code, "params": params})


def coded(code: str, /, **params: ParamValue) -> tuple[str, Params]:
    """Codice controllato con i suoi parametri (per log e classificazione)."""
    return _check(code), params
