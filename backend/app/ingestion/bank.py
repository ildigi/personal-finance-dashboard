"""Ingestione bancaria: normalizza → deduplica → salva.

Regole (SPEC §3, §8):
- **Idempotenza.** Risincronizzare lo stesso periodo non crea duplicati: un movimento è
  riconosciuto dal suo ID del provider oppure, in mancanza, dall'impronta `dedupe_hash`.
- **Pending → booked.** Molte banche cambiano ID quando un movimento in sospeso viene
  contabilizzato: il booked "promuove" il pending corrispondente (stesso conto, stesso
  importo, date vicine) invece di crearne uno nuovo.
- **Pending spariti.** Un pending che la banca non restituisce più (annullato o già
  promosso altrove) viene rimosso, salvo che tu l'abbia corretto a mano.
- **Correzioni manuali intoccabili.** La sync aggiorna solo i dati del provider (stato,
  date, descrizione, dato grezzo); tipo, categoria, note e collegamenti non vengono mai
  sovrascritti.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.classification.text import clean_description
from app.ingestion import fx, reconcile
from app.integrations.base import (
    BankConnector,
    ProviderAccount,
    ProviderBalance,
    ProviderTransaction,
)
from app.models import Account, AccountSource, Balance, ManualOverride, Transaction
from app.models.enums import ClassificationSource, TransactionStatus
from app.services.fx import CENT, rate_to_eur, to_eur
from app.services.transactions import compute_dedupe_hash, default_kind

#: Quanti giorni prima dell'ultimo movimento noto si riparte, per intercettare
#: contabilizzazioni tardive e pending cambiati.
OVERLAP_DAYS = 10
#: Prima sincronizzazione: quanto indietro chiedere.
INITIAL_HISTORY_DAYS = 540
#: Distanza massima tra la data del pending e quella del booked che lo sostituisce.
PROMOTION_WINDOW_DAYS = 5


@dataclass
class JobStats:
    fetched: int = 0
    created: int = 0
    updated: int = 0
    details: dict[str, int] = field(default_factory=dict)

    def bump(self, key: str, n: int = 1) -> None:
        self.details[key] = self.details.get(key, 0) + n


# --- Conti e saldi ------------------------------------------------------------------------


def upsert_accounts(
    session: Session, source: AccountSource, accounts: list[ProviderAccount]
) -> tuple[dict[str, Account], JobStats]:
    stats = JobStats(fetched=len(accounts))
    by_external: dict[str, Account] = {}
    for pa in accounts:
        account = session.scalar(
            select(Account).where(
                Account.source_id == source.id, Account.external_id == pa.external_id
            )
        )
        if account is None:
            account = Account(
                source_id=source.id,
                external_id=pa.external_id,
                name=pa.name,
                type=pa.type,
                currency=pa.currency,
                iban=pa.iban,
                institution=pa.institution,
            )
            session.add(account)
            stats.created += 1
        else:
            # Il nome resta quello scelto dall'utente; si aggiornano solo i dati del provider.
            changed = (account.iban, account.institution) != (pa.iban, pa.institution)
            account.iban, account.institution = pa.iban, pa.institution
            stats.updated += int(changed)
        by_external[pa.external_id] = account
    session.flush()
    return by_external, stats


#: Codice ISO 4217 per "nessuna valuta".
NO_CURRENCY = "XXX"


def sync_balances(session: Session, account: Account, connector: BankConnector) -> JobStats:
    fetched = connector.get_balances(account.external_id)
    stats = JobStats(fetched=len(fetched))
    currencies = {pb.currency for pb in fetched}
    # Conto senza valuta propria (es. PayPal: "XXX"): l'euro se c'è un saldo in euro,
    # altrimenti la valuta del saldo.
    if account.currency == NO_CURRENCY and fetched:
        account.currency = "EUR" if "EUR" in currencies else fetched[0].currency
    balances = _merge_currencies(session, account, fetched)
    for pb in balances:
        row = session.scalar(
            select(Balance).where(
                Balance.account_id == account.id,
                Balance.as_of == pb.as_of,
                Balance.balance_type == pb.balance_type,
            )
        )
        if row is None:
            session.add(
                Balance(
                    account_id=account.id,
                    as_of=pb.as_of,
                    balance=pb.amount,
                    currency=pb.currency,
                    balance_type=pb.balance_type,
                    source="provider",
                )
            )
            stats.created += 1
        elif row.balance != pb.amount or row.currency != pb.currency:
            row.balance, row.currency = pb.amount, pb.currency
            stats.updated += 1
    session.flush()
    return stats


def _merge_currencies(
    session: Session, account: Account, balances: list[ProviderBalance]
) -> list[ProviderBalance]:
    """Un saldo per giorno e tipo: i saldi in più valute (PayPal: euro e dollari) si
    sommano nella valuta del conto, come mostra l'app del provider."""
    groups: dict[tuple[date, str], list[ProviderBalance]] = {}
    for pb in balances:
        groups.setdefault((pb.as_of, pb.balance_type), []).append(pb)
    merged: list[ProviderBalance] = []
    for (day, _), items in groups.items():
        if len(items) == 1:
            merged.append(items[0])
            continue
        fx.ensure_rates(session, [(pb.currency, day) for pb in items], day)
        total = sum((to_eur(session, pb.amount, pb.currency, day) for pb in items), Decimal("0.00"))
        if account.currency != "EUR":
            total = (total / rate_to_eur(session, account.currency, day)).quantize(CENT)
        merged.append(replace(items[0], amount=total, currency=account.currency))
    return merged


# --- Movimenti --------------------------------------------------------------------------------


def sync_since(session: Session, account: Account, today: date) -> date:
    last = session.scalar(
        select(func.max(Transaction.booking_date)).where(
            Transaction.account_id == account.id, Transaction.is_manual.is_(False)
        )
    )
    if last is None:
        return today - timedelta(days=INITIAL_HISTORY_DAYS)
    return last - timedelta(days=OVERLAP_DAYS)


def _provider_fields(
    session: Session, account: Account, ptx: ProviderTransaction
) -> dict[str, Any]:
    """Campi che appartengono al provider: la sync li può aggiornare."""
    return {
        "booking_date": ptx.booking_date,
        "value_date": ptx.value_date,
        "status": ptx.status,
        "amount": ptx.amount,
        "currency": ptx.currency,
        "amount_eur": to_eur(session, ptx.amount, ptx.currency, ptx.booking_date),
        "original_amount": ptx.original_amount,
        "original_currency": ptx.original_currency,
        "fx_rate": ptx.fx_rate,
        "description_raw": ptx.description,
        "description_clean": clean_description(ptx.description),
        "counterparty_name": ptx.counterparty_name,
        "counterparty_iban": ptx.counterparty_iban,
        "provider_category": ptx.provider_category,
        "mcc": ptx.mcc,
        "raw": ptx.raw or None,
        "dedupe_hash": compute_dedupe_hash(
            account.id, ptx.booking_date, ptx.amount, ptx.currency, ptx.description
        ),
    }


def _apply(tx: Transaction, fields: dict[str, Any]) -> bool:
    changed = False
    for key, value in fields.items():
        if getattr(tx, key) != value:
            setattr(tx, key, value)
            changed = True
    return changed


def _find_pending_to_promote(
    session: Session, account: Account, ptx: ProviderTransaction, still_pending: set[str]
) -> Transaction | None:
    candidates = session.scalars(
        select(Transaction).where(
            Transaction.account_id == account.id,
            Transaction.status == TransactionStatus.PENDING.value,
            Transaction.is_manual.is_(False),
            Transaction.amount == ptx.amount,
            Transaction.currency == ptx.currency,
            Transaction.booking_date.between(
                ptx.booking_date - timedelta(days=PROMOTION_WINDOW_DAYS),
                ptx.booking_date + timedelta(days=PROMOTION_WINDOW_DAYS),
            ),
        )
    ).all()
    # Un pending che il provider restituisce ancora come pending è un altro movimento.
    usable = [c for c in candidates if c.external_id not in still_pending]
    if not usable:
        return None
    return min(usable, key=lambda c: (abs((c.booking_date - ptx.booking_date).days), c.id))


def upsert_transaction(
    session: Session,
    account: Account,
    ptx: ProviderTransaction,
    still_pending: set[str],
) -> str:
    """Restituisce l'esito: created, updated, promoted o unchanged."""
    fields = _provider_fields(session, account, ptx)

    existing: Transaction | None = None
    if ptx.external_id:
        existing = session.scalar(
            select(Transaction).where(
                Transaction.account_id == account.id, Transaction.external_id == ptx.external_id
            )
        )
    else:
        existing = session.scalar(
            select(Transaction).where(
                Transaction.account_id == account.id,
                Transaction.external_id.is_(None),
                Transaction.is_manual.is_(False),
                Transaction.dedupe_hash == fields["dedupe_hash"],
            )
        )
    if existing is not None:
        return "updated" if _apply(existing, fields) else "unchanged"

    if ptx.status == TransactionStatus.BOOKED.value:
        pending = _find_pending_to_promote(session, account, ptx, still_pending)
        if pending is not None:
            pending.external_id = ptx.external_id
            _apply(pending, fields)
            return "promoted"

    session.add(
        Transaction(
            account_id=account.id,
            external_id=ptx.external_id,
            kind=default_kind(ptx.amount),
            classification_source=ClassificationSource.NONE,
            is_manual=False,
            **fields,
        )
    )
    return "created"


def remove_vanished_pending(
    session: Session, account: Account, since: date, seen_ids: set[str]
) -> int:
    """Elimina i pending del periodo che il provider non restituisce più."""
    has_override = exists().where(ManualOverride.transaction_id == Transaction.id)
    stale = session.scalars(
        select(Transaction).where(
            Transaction.account_id == account.id,
            Transaction.status == TransactionStatus.PENDING.value,
            Transaction.is_manual.is_(False),
            Transaction.booking_date >= since,
            Transaction.external_id.is_not(None),
            ~has_override,
        )
    ).all()
    removed = 0
    for tx in stale:
        if tx.external_id not in seen_ids:
            session.delete(tx)
            removed += 1
    return removed


def sync_transactions(
    session: Session,
    account: Account,
    connector: BankConnector,
    *,
    today: date,
    since: date | None = None,
) -> JobStats:
    since = since or sync_since(session, account, today)
    fetched = connector.get_transactions(account.external_id, since)
    stats = JobStats(fetched=len(fetched))
    # Movimenti in altre valute (es. PayPal in USD): servono i cambi per l'importo in EUR.
    fx.ensure_rates(session, [(t.currency, t.booking_date) for t in fetched], today)

    seen = {t.external_id for t in fetched if t.external_id}
    still_pending = {t.external_id for t in fetched if t.external_id and t.status == "pending"}

    # Prima i booked (possono promuovere pending già salvati), poi i pending.
    ordered = sorted(fetched, key=lambda t: (t.status != "booked", t.booking_date))
    for ptx in ordered:
        outcome = upsert_transaction(session, account, ptx, still_pending)
        session.flush()
        if outcome == "created":
            stats.created += 1
        elif outcome in ("updated", "promoted"):
            stats.updated += 1
        stats.bump(outcome)

    removed = remove_vanished_pending(session, account, since, seen)
    if removed:
        stats.bump("removed_pending", removed)
    session.flush()
    reconcile.reconcile_fx(session, account)
    return stats
