from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classification.engine import classify_all
from app.ingestion.reconcile import reconcile_fx
from app.models import Account, AccountSource, Balance, Category, Transaction
from app.models.enums import TransactionKind
from app.services.networth import net_worth_overview
from tests.conftest import make_synced_transaction

D0, D1 = date(2026, 9, 20), date(2026, 10, 6)


def _paypal(db: Session) -> tuple[Account, Account]:
    source = AccountSource(provider="mock", institution="Test", display_name="Test")
    db.add(source)
    db.flush()
    paypal = Account(
        source_id=source.id,
        external_id="pp",
        name="Conto PayPal",
        type="checking",
        currency="EUR",
        institution="PayPal",
    )
    bank = Account(
        source_id=source.id,
        external_id="rev",
        name="Revolut",
        type="checking",
        currency="EUR",
        institution="Revolut",
    )
    db.add_all([paypal, bank])
    db.commit()
    return paypal, bank


def _balance(db: Session, account: Account, day: date, amount: str) -> None:
    db.add(
        Balance(
            account_id=account.id,
            as_of=day,
            balance=Decimal(amount),
            currency="EUR",
            balance_type="booked",
            source="provider",
        )
    )
    db.commit()


def _adjustments(db: Session, account: Account) -> list[Transaction]:
    return list(
        db.scalars(
            select(Transaction).where(
                Transaction.account_id == account.id,
                Transaction.external_id.like("fx-adjust-%"),
            )
        )
    )


def test_conversion_cost_is_recorded_from_the_real_balance(seeded: Session) -> None:
    db = seeded
    paypal, _ = _paypal(db)
    _balance(db, paypal, D0, "0.00")
    make_synced_transaction(
        db,
        paypal,
        amount="100.00",
        description="Payroll",
        booking_date=date(2026, 9, 21),
        currency="USD",
    )
    make_synced_transaction(
        db, paypal, amount="-97.00", description="Trasferimento di denaro", booking_date=D1
    )
    _balance(db, paypal, D1, "0.00")

    tx = reconcile_fx(db, paypal)
    db.commit()
    assert tx is not None
    assert (tx.amount_eur, tx.booking_date, tx.description_raw) == (
        Decimal("-3.00"),
        D1,
        "Costo del cambio PayPal",
    )
    # Rifarlo non crea doppioni.
    reconcile_fx(db, paypal)
    db.commit()
    assert len(_adjustments(db, paypal)) == 1

    classify_all(db)
    db.commit()
    altro = db.scalar(select(Category).where(Category.code == "altro"))
    assert altro is not None
    assert (tx.kind, tx.category_id) == (TransactionKind.FEE, altro.id)


def test_nothing_without_foreign_currency_or_with_a_big_gap(db: Session) -> None:
    paypal, _ = _paypal(db)
    _balance(db, paypal, D0, "0.00")
    make_synced_transaction(db, paypal, amount="50.00", description="Rimborso", booking_date=D1)
    _balance(db, paypal, D1, "40.00")
    assert reconcile_fx(db, paypal) is None  # tutto in euro: non è il cambio

    make_synced_transaction(
        db, paypal, amount="10.00", description="Payroll", booking_date=D1, currency="USD"
    )
    # Differenza -20 su 10 in valuta: troppo grande per essere il cambio.
    assert reconcile_fx(db, paypal) is None
    assert _adjustments(db, paypal) == []


def test_first_time_with_a_known_starting_balance(db: Session) -> None:
    paypal, _ = _paypal(db)
    make_synced_transaction(
        db,
        paypal,
        amount="200.00",
        description="Payroll",
        booking_date=date(2026, 9, 21),
        currency="USD",
    )
    make_synced_transaction(
        db, paypal, amount="-194.00", description="Trasferimento di denaro", booking_date=D1
    )
    _balance(db, paypal, D1, "0.00")
    assert reconcile_fx(db, paypal) is None  # nessun saldo precedente salvato
    tx = reconcile_fx(db, paypal, start=(D0, Decimal("0.00")))
    assert tx is not None
    assert tx.amount_eur == Decimal("-6.00")


def test_card_funded_purchases_do_not_move_the_paypal_balance(db: Session) -> None:
    paypal, bank = _paypal(db)
    make_synced_transaction(
        db, bank, amount="-1.00", description="Caffe", booking_date=date(2026, 9, 20)
    )
    make_synced_transaction(
        db, paypal, amount="50.00", description="Payroll", booking_date=date(2026, 9, 21)
    )
    make_synced_transaction(
        db, paypal, amount="-9.99", description="Steam", booking_date=date(2026, 9, 25)
    )
    make_synced_transaction(
        db, bank, amount="-9.99", description="Paypal *steam Games", booking_date=date(2026, 9, 25)
    )
    make_synced_transaction(
        db, paypal, amount="-50.00", description="Prelievo", booking_date=date(2026, 9, 28)
    )
    _balance(db, paypal, D1, "0.00")
    _balance(db, bank, D1, "100.00")
    ov = net_worth_overview(db, D1, None)
    cash = {p.date: p.cash_eur for p in ov.series}
    # Il 22: PayPal 50 (lo stipendio) + banca 109,99 (prima dell'acquisto pagato con la
    # carta). Contando l'acquisto anche su PayPal risulterebbero 9,99 in più.
    assert cash[date(2026, 9, 22)] == Decimal("159.99")
    assert cash[date(2026, 9, 26)] == Decimal("150.00")
