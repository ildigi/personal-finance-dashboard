"""PayPal tra i tuoi conti (SPEC §11): niente spese contate due volte.

- **Pagamento finanziato da una carta:** paghi con PayPal usando la carta Revolut o CA.
  Lo stesso acquisto compare su PayPal (col nome del negozio) e sulla banca come
  `PAYPAL *NEGOZIO`, stesso importo, entro pochi giorni. La spesa resta su PayPal; il
  movimento della banca è solo denaro spostato verso PayPal.
- **Prelievo verso la banca:** l'uscita da PayPal (trasferimento di denaro, senza
  destinatario) e l'entrata sulla banca (`PAYPAL*NOME COGNOME`) sono un giroconto. La banca
  riceve un po' meno: la differenza è la commissione di PayPal (fino al 5%).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classification.text import contains_phrase, match_text
from app.models import Account, Transaction
from app.models.enums import TransactionStatus

#: Giorni massimi tra i due lati (la banca può contabilizzare dopo).
MAX_DAYS = 3
#: Commissione massima di un prelievo da PayPal.
MAX_FEE = Decimal("0.05")


@dataclass(frozen=True)
class PaypalCandidate:
    id: int
    day: date
    amount_eur: Decimal  # con segno: negativo = uscita
    on_paypal: bool  # movimento del conto PayPal
    mentions_paypal: bool  # sulla banca: la causale nomina PayPal
    withdrawal: bool  # su PayPal: trasferimento di denaro verso un tuo conto


def _gap(a: date, b: date) -> int:
    return abs((a - b).days)


def link_paypal(
    candidates: list[PaypalCandidate],
) -> tuple[dict[int, int], dict[int, int], set[int]]:
    """(prelievi abbinati: id → partner in entrambe le direzioni, pagamenti finanziati:
    id banca → id PayPal, prelievi senza l'altro lato)."""
    paypal_out = [c for c in candidates if c.on_paypal and c.amount_eur < 0]
    bank = [c for c in candidates if not c.on_paypal and c.mentions_paypal]

    funding_options: list[tuple[int, int, int]] = []
    withdrawal_options: list[tuple[int, int, int]] = []
    for p in paypal_out:
        for b in bank:
            gap = _gap(p.day, b.day)
            if gap > MAX_DAYS:
                continue
            if p.withdrawal:
                received, sent = b.amount_eur, -p.amount_eur
                if received > 0 and sent * (1 - MAX_FEE) <= received <= sent:
                    withdrawal_options.append((gap, p.id, b.id))
            elif b.amount_eur == p.amount_eur:
                funding_options.append((gap, p.id, b.id))

    used: set[int] = set()
    pairs: dict[int, int] = {}
    for _, p_id, b_id in sorted(withdrawal_options):
        if p_id in used or b_id in used:
            continue
        used.update((p_id, b_id))
        pairs[p_id], pairs[b_id] = b_id, p_id
    funding: dict[int, int] = {}
    for _, p_id, b_id in sorted(funding_options):
        if p_id in used or b_id in used:
            continue
        used.update((p_id, b_id))
        funding[b_id] = p_id
    unpaired = {p.id for p in paypal_out if p.withdrawal and p.id not in pairs}
    return pairs, funding, unpaired


def funded_purchase_ids(session: Session) -> set[int]:
    """Acquisti PayPal coperti da una carta: non cambiano il saldo PayPal (servono a
    ricostruire lo storico del saldo e a confrontarlo con quello vero)."""
    paypal_accounts = {
        a.id
        for a in session.scalars(select(Account))
        if contains_phrase(match_text(a.institution), "paypal")
    }
    if not paypal_accounts:
        return set()
    candidates = []
    for tx in session.scalars(
        select(Transaction).where(Transaction.status == TransactionStatus.BOOKED.value)
    ):
        on_paypal = tx.account_id in paypal_accounts
        text = match_text(f"{tx.description_raw} {tx.counterparty_name or ''}")
        mentions = not on_paypal and contains_phrase(text, "paypal")
        if (on_paypal or mentions) and tx.amount_eur != 0:
            code = (tx.raw or {}).get("bank_transaction_code") if isinstance(tx.raw, dict) else None
            sub = str(code.get("sub_code") or "").upper() if isinstance(code, dict) else ""
            candidates.append(
                PaypalCandidate(
                    id=tx.id,
                    day=tx.booking_date,
                    amount_eur=tx.amount_eur,
                    on_paypal=on_paypal,
                    mentions_paypal=mentions,
                    withdrawal=on_paypal and tx.amount_eur < 0 and sub == "MONEY_TRANSFER",
                )
            )
    _, funding, _ = link_paypal(candidates)
    return set(funding.values())
