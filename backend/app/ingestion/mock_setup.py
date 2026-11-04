"""Sorgenti di prova: creazione e rimozione completa dei dati finti.

I dati di prova passano dalla stessa pipeline dei dati veri. Prima di collegare i
conti veri (Fase 8) si possono togliere con `remove_mock_data`, che tocca solo ciò
che appartiene a sorgenti con provider `mock`.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.locale import DataLocale, data_locale
from app.integrations.registry import MOCK_BROKER
from app.models import Account, AccountSource, Merchant, Portfolio, Transaction, TransactionRule
from app.models.enums import MerchantOrigin, Provider, RuleOrigin

MOCK_SOURCES = [
    ("mock:credit_agricole", "Crédit Agricole Italia"),
    ("mock:revolut", "Revolut"),
    (MOCK_BROKER, "Trading 212"),
]
# Il nome mostrato dice che sono dati di prova, nella lingua dei dati.
MOCK_SUFFIX: dict[DataLocale, str] = {"it": "prova", "en": "demo"}


def ensure_mock_sources(session: Session) -> list[AccountSource]:
    suffix = MOCK_SUFFIX[data_locale(session)]
    sources = []
    for ref, institution in MOCK_SOURCES:
        name = f"{institution} ({suffix})"
        source = session.scalar(
            select(AccountSource).where(
                AccountSource.provider == Provider.MOCK, AccountSource.credentials_ref == ref
            )
        )
        if source is None:
            source = AccountSource(
                provider=Provider.MOCK,
                institution=institution,
                display_name=name,
                credentials_ref=ref,
            )
            session.add(source)
        sources.append(source)
    session.flush()
    return sources


@dataclass
class RemovalReport:
    sources: int
    accounts: int
    transactions: int
    merchants: int = 0
    rules: int = 0


def _remove_orphans(session: Session) -> tuple[int, int]:
    """Merchant riconosciuti in automatico rimasti senza movimenti, e le regole imparate
    che li citavano: nati dai dati di prova, non hanno senso con i dati veri."""
    used = select(Transaction.merchant_id).where(Transaction.merchant_id.is_not(None))
    orphans = set(
        session.scalars(
            select(Merchant.id).where(
                Merchant.origin == MerchantOrigin.AUTO, Merchant.id.not_in(used)
            )
        )
    )
    rules = [
        r
        for r in session.scalars(
            select(TransactionRule).where(TransactionRule.origin == RuleOrigin.LEARNED)
        )
        if r.conditions.get("merchant_id") in orphans or r.actions.get("merchant_id") in orphans
    ]
    for rule in rules:
        session.delete(rule)
    session.execute(delete(Merchant).where(Merchant.id.in_(orphans)))
    session.flush()
    return len(orphans), len(rules)


def remove_mock_data(session: Session) -> RemovalReport:
    """Elimina sorgenti di prova, i loro conti e tutto ciò che ne dipende."""
    source_ids = list(
        session.scalars(select(AccountSource.id).where(AccountSource.provider == Provider.MOCK))
    )
    return remove_sources(session, source_ids)


def remove_sources(session: Session, source_ids: list[int]) -> RemovalReport:
    """Elimina le sorgenti indicate, i loro conti e tutto ciò che ne dipende."""
    account_ids = list(session.scalars(select(Account.id).where(Account.source_id.in_(source_ids))))

    tx_count = len(
        session.scalars(select(Transaction.id).where(Transaction.account_id.in_(account_ids))).all()
    )
    # I collegamenti tra movimenti (trasferimenti, rimborsi) diventano NULL in cascata.
    session.execute(delete(Transaction).where(Transaction.account_id.in_(account_ids)))
    session.execute(delete(Portfolio).where(Portfolio.account_id.in_(account_ids)))
    session.execute(delete(Account).where(Account.id.in_(account_ids)))
    session.execute(delete(AccountSource).where(AccountSource.id.in_(source_ids)))
    session.flush()
    merchants, rules = _remove_orphans(session)
    return RemovalReport(len(source_ids), len(account_ids), tx_count, merchants, rules)
