from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.classification.engine import classify_all
from app.integrations.enablebanking.connector import EnableBankingConnector, session_account
from app.models import Account, AccountSource
from app.models.enums import TransactionKind
from tests.conftest import make_synced_transaction

WITHDRAWAL_RAW: dict[str, Any] = {
    "bank_transaction_code": {"code": "PAYMENT", "sub_code": "MONEY_TRANSFER"}
}


def _accounts(db: Session) -> tuple[Account, Account]:
    source = AccountSource(provider="mock", institution="Test", display_name="Test")
    db.add(source)
    db.flush()
    bank = Account(
        source_id=source.id,
        external_id="rev",
        name="Revolut",
        type="checking",
        currency="EUR",
        institution="Revolut",
    )
    paypal = Account(
        source_id=source.id,
        external_id="pp",
        name="Conto PayPal",
        type="checking",
        currency="EUR",
        institution="PayPal",
    )
    db.add_all([bank, paypal])
    db.commit()
    return bank, paypal


def test_purchase_paid_with_paypal_is_counted_once(db: Session) -> None:
    bank, paypal = _accounts(db)
    on_paypal = make_synced_transaction(
        db,
        paypal,
        amount="-9.99",
        description="www.steampowered.com",
        booking_date=date(2025, 9, 4),
    )
    on_bank = make_synced_transaction(
        db, bank, amount="-9.99", description="Paypal *steam Games", booking_date=date(2025, 9, 5)
    )
    other = make_synced_transaction(
        db, bank, amount="-4.00", description="Paypal *steam Games", booking_date=date(2025, 9, 5)
    )
    classify_all(db)
    db.commit()
    assert on_paypal.kind == TransactionKind.EXPENSE
    assert on_bank.kind == TransactionKind.INTERNAL_TRANSFER
    assert on_bank.classification_reason == "reason.paid_with_paypal"
    # Senza l'acquisto su PayPal (storico più corto) la spesa resta quella della banca.
    assert other.kind == TransactionKind.EXPENSE


def test_withdrawal_to_the_bank_is_a_transfer_even_with_a_fee(db: Session) -> None:
    bank, paypal = _accounts(db)
    sent = make_synced_transaction(
        db,
        paypal,
        amount="-100.00",
        description="Trasferimento di denaro",
        booking_date=date(2026, 9, 28),
        raw=WITHDRAWAL_RAW,
    )
    received = make_synced_transaction(
        db,
        bank,
        amount="97.50",
        description="Paypal*rossi Mario",
        booking_date=date(2026, 9, 28),
    )
    lonely = make_synced_transaction(
        db,
        paypal,
        amount="-50.00",
        description="Trasferimento di denaro",
        booking_date=date(2026, 8, 1),
        raw=WITHDRAWAL_RAW,
    )
    salary = make_synced_transaction(
        db, paypal, amount="120.00", description="ACME Payroll", booking_date=date(2026, 9, 21)
    )
    classify_all(db)
    db.commit()
    assert (sent.kind, received.kind) == (TransactionKind.INTERNAL_TRANSFER,) * 2
    assert sent.transfer_pair_id == received.id
    assert received.transfer_pair_id == sent.id
    # Il prelievo senza l'altro lato resta comunque un giroconto (va solo a un tuo conto).
    assert lonely.kind == TransactionKind.INTERNAL_TRANSFER
    assert salary.kind == TransactionKind.INCOME


def test_paypal_account_name_currency_and_descriptions(db: Session) -> None:
    account = session_account(
        {
            "uid": "u1",
            "identification_hash": "h1",
            "account_id": {"iban": None},
            "product": "PAYPAL_PREMIER_ACCOUNT",
            "currency": "XXX",
        }
    )
    assert account["name"] is None
    connector = EnableBankingConnector(
        client=None,  # type: ignore[arg-type]
        session_data={"aspsp": {"name": "PayPal"}, "accounts": [account]},
    )
    assert connector.list_accounts()[0].name == "Conto PayPal"
    tx = connector._transaction(
        "h1",
        {
            "status": "BOOK",
            "transaction_amount": {"amount": "10.00", "currency": "EUR"},
            "credit_debit_indicator": "DBIT",
            "booking_date": "2026-09-28",
            "bank_transaction_code": {"code": "PAYMENT", "sub_code": "MONEY_TRANSFER"},
        },
    )
    assert tx is not None
    assert tx.description == "Trasferimento di denaro"


def test_account_without_currency_takes_the_balance_currency(db: Session) -> None:
    from decimal import Decimal

    from app.ingestion.bank import sync_balances
    from app.integrations.base import ProviderBalance

    _, paypal = _accounts(db)
    paypal.currency = "XXX"
    db.commit()

    class Connector:
        def get_balances(self, external_id: str) -> list[ProviderBalance]:
            return [
                ProviderBalance(
                    account_external_id=external_id,
                    as_of=date(2026, 10, 6),
                    amount=Decimal("12.00"),
                    currency="USD",
                    balance_type="booked",
                )
            ]

    sync_balances(db, paypal, Connector())  # type: ignore[arg-type]
    assert paypal.currency == "USD"


def test_multi_currency_balances_are_summed_in_euro(db: Session) -> None:
    from decimal import Decimal

    from app.ingestion.bank import sync_balances
    from app.models import Balance, FxRate

    _, paypal = _accounts(db)
    paypal.currency = "XXX"
    db.add(FxRate(date=date(2026, 10, 5), currency="USD", rate_to_eur=Decimal("0.8"), source="BCE"))
    db.commit()

    class Client:
        def balances(self, uid: str) -> list[dict[str, Any]]:
            return [
                {"balance_type": "XPCD", "balance_amount": {"amount": "10.00", "currency": "EUR"}},
                {"balance_type": "XPCD", "balance_amount": {"amount": "5.00", "currency": "USD"}},
            ]

    account = {"uid": "u1", "external_id": "pp", "currency": "XXX"}
    connector = EnableBankingConnector(
        client=Client(),  # type: ignore[arg-type]
        session_data={"aspsp": {"name": "PayPal"}, "accounts": [account]},
    )
    assert {b.currency for b in connector.get_balances("pp")} == {"EUR", "USD"}
    sync_balances(db, paypal, connector)
    db.commit()
    assert paypal.currency == "EUR"
    rows = db.query(Balance).filter(Balance.account_id == paypal.id).all()
    # 10 EUR + 5 USD × 0,80 = 14 EUR: come il totale mostrato dall'app PayPal.
    assert [(r.balance, r.currency, r.balance_type) for r in rows] == [
        (Decimal("14.00"), "EUR", "booked")
    ]
