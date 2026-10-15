"""Costo del cambio che il provider non manda come movimento (es. PayPal).

PayPal converte i dollari in euro con un cambio peggiore di quello BCE (la sua commissione),
ma via Open Banking non arriva la conversione: i movimenti in USD valutati al cambio BCE
non tornano con il saldo vero. Si confronta il saldo vero con quello atteso (saldo
precedente + movimenti nel mezzo): se ci sono movimenti in un'altra valuta e la differenza
è piccola, la si registra come movimento «Costo del cambio».
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classification.paypal import funded_purchase_ids
from app.classification.text import clean_description
from app.models import Account, Balance, Transaction
from app.models.enums import TransactionStatus
from app.services.transactions import compute_dedupe_hash, default_kind

log = logging.getLogger(__name__)

#: Oltre questa quota dei movimenti in valuta, la differenza non è il cambio: non si tocca.
MAX_SHARE = Decimal("0.06")
COST_LABEL = "Costo del cambio"
GAIN_LABEL = "Differenza di cambio a favore"


def adjustment_external_id(account: Account, day: date) -> str:
    return f"fx-adjust-{account.id}-{day.isoformat()}"


def reconcile_fx(
    session: Session,
    account: Account,
    *,
    start: tuple[date, Decimal] | None = None,
) -> Transaction | None:
    """Registra (o aggiorna) la differenza di cambio tra l'ultimo saldo e quello prima.
    `start` = (giorno, saldo) noto a mano quando manca un saldo salvato precedente."""
    if account.currency != "EUR":
        return None
    rows = list(
        session.scalars(
            select(Balance)
            .where(Balance.account_id == account.id, Balance.balance_type == "booked")
            .order_by(Balance.as_of)
        )
    )
    if not rows or rows[-1].currency != "EUR":
        return None
    end = rows[-1]
    if start is None:
        previous = [b for b in rows[:-1] if b.currency == "EUR"]
        if not previous:
            return None
        start = (previous[-1].as_of, previous[-1].balance)
    start_day, start_balance = start
    external_id = adjustment_external_id(account, end.as_of)
    funded = funded_purchase_ids(session)

    window = [
        t
        for t in session.scalars(
            select(Transaction).where(
                Transaction.account_id == account.id,
                Transaction.status == TransactionStatus.BOOKED.value,
                Transaction.booking_date > start_day,
                Transaction.booking_date <= end.as_of,
            )
        )
        if t.external_id != external_id and t.id not in funded
    ]
    foreign = sum((abs(t.amount_eur) for t in window if t.currency != "EUR"), Decimal("0"))
    existing = session.scalar(
        select(Transaction).where(
            Transaction.account_id == account.id, Transaction.external_id == external_id
        )
    )
    expected = start_balance + sum((t.amount_eur for t in window), Decimal("0"))
    diff = (end.balance - expected).quantize(Decimal("0.01"))
    if foreign == 0 or diff == 0 or abs(diff) > foreign * MAX_SHARE:
        if existing is not None and foreign > 0 and diff == 0:
            session.delete(existing)
        if foreign > 0 and diff != 0 and abs(diff) > foreign * MAX_SHARE:
            log.info(
                "Conto %s: differenza col saldo troppo grande per essere il cambio", account.id
            )
        return None

    label = f"{COST_LABEL} {account.institution}" if diff < 0 else GAIN_LABEL
    fields = {
        "booking_date": end.as_of,
        "value_date": end.as_of,
        "amount": diff,
        "currency": "EUR",
        "amount_eur": diff,
        "description_raw": label,
        "description_clean": clean_description(label),
        "raw": {"reconciliation": "fx", "from": start_day.isoformat(), "to": end.as_of.isoformat()},
        "dedupe_hash": compute_dedupe_hash(account.id, end.as_of, diff, "EUR", label),
    }
    if existing is None:
        existing = Transaction(
            account_id=account.id,
            external_id=external_id,
            status=TransactionStatus.BOOKED.value,
            kind=default_kind(diff),
            **fields,
        )
        session.add(existing)
    else:
        for key, value in fields.items():
            setattr(existing, key, value)
    session.flush()
    return existing
