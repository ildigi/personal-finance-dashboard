"""Connettori finti: stessa interfaccia di sola lettura dei connettori veri."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from app.integrations.base import (
    ProviderAccount,
    ProviderBalance,
    ProviderBrokerAccount,
    ProviderCash,
    ProviderCashFlow,
    ProviderDividend,
    ProviderOrder,
    ProviderPie,
    ProviderPosition,
    ProviderTransaction,
)
from app.integrations.mock import scenario as sc

MockBank = Literal["credit_agricole", "revolut"]

_ACCOUNTS: dict[MockBank, list[ProviderAccount]] = {
    "credit_agricole": [
        ProviderAccount(
            external_id=sc.CA_CONTO,
            name="Conto corrente",
            type="checking",
            currency="EUR",
            institution="Crédit Agricole Italia",
            iban=sc.IBAN_CA,
        ),
        ProviderAccount(
            external_id=sc.CA_CARTA,
            name="Carta di credito",
            type="credit_card",
            currency="EUR",
            institution="Crédit Agricole Italia",
        ),
    ],
    "revolut": [
        ProviderAccount(
            external_id=sc.REV_EUR,
            name="Conto EUR",
            type="checking",
            currency="EUR",
            institution="Revolut",
            iban=sc.IBAN_REVOLUT,
        ),
    ],
}


class MockBankConnector:
    """Banca finta (Crédit Agricole o Revolut) alla data `as_of`."""

    def __init__(self, bank: MockBank, as_of: date) -> None:
        self.bank = bank
        self.as_of = as_of

    def list_accounts(self) -> list[ProviderAccount]:
        return list(_ACCOUNTS[self.bank])

    def _own(self, account_external_id: str) -> list[sc.MockTx]:
        if account_external_id not in {a.external_id for a in _ACCOUNTS[self.bank]}:
            raise KeyError(f"Conto sconosciuto per {self.bank}: {account_external_id}")
        return sc.ledger_for(self.as_of).transactions.get(account_external_id, [])

    def get_balances(self, account_external_id: str) -> list[ProviderBalance]:
        items = self._own(account_external_id)
        opening = sc.OPENING_BALANCES.get(account_external_id, Decimal(0))
        booked = opening + sum(
            (t.amount for t in items if not t.is_pending(self.as_of)), Decimal(0)
        )
        available = booked + sum((t.amount for t in items if t.is_pending(self.as_of)), Decimal(0))
        return [
            ProviderBalance(account_external_id, self.as_of, booked, "EUR", "booked"),
            ProviderBalance(account_external_id, self.as_of, available, "EUR", "available"),
        ]

    def get_transactions(self, account_external_id: str, since: date) -> list[ProviderTransaction]:
        result = []
        for t in self._own(account_external_id):
            if t.day < since:
                continue
            pending = t.is_pending(self.as_of)
            external_id = t.external_id(self.as_of)
            description = (t.pending_description or t.description) if pending else t.description
            result.append(
                ProviderTransaction(
                    account_external_id=account_external_id,
                    external_id=external_id,
                    booking_date=t.day,
                    value_date=t.day,
                    status="pending" if pending else "booked",
                    amount=t.amount,
                    currency="EUR",
                    description=description,
                    original_amount=t.original_amount,
                    original_currency=t.original_currency,
                    fx_rate=t.fx_rate,
                    counterparty_name=t.counterparty_name,
                    counterparty_iban=t.counterparty_iban,
                    provider_category=t.category,
                    mcc=t.mcc,
                    raw={
                        "mock": True,
                        "transactionId": external_id,
                        "bookingStatus": "pending" if pending else "booked",
                        "remittanceInformation": description,
                        "amount": {"value": str(t.amount), "currency": "EUR"},
                    },
                )
            )
        return result


class MockBrokerConnector:
    """Trading 212 finto: i versamenti seguono i bonifici partiti dal conto CA."""

    def __init__(self, as_of: date) -> None:
        self.as_of = as_of

    @property
    def _ledger(self) -> sc.Ledger:
        return sc.ledger_for(self.as_of)

    def get_account(self) -> ProviderBrokerAccount:
        return ProviderBrokerAccount(sc.T212, "Trading 212 Invest", "EUR", "Trading 212")

    def get_positions(self) -> list[ProviderPosition]:
        positions = []
        for ticker, spec in sc.INSTRUMENTS.items():
            orders = [o for o in self._ledger.orders if o.ticker == ticker]
            qty = sum((o.quantity for o in orders), Decimal(0))
            if qty <= 0:
                continue
            cost_ccy = sum((o.quantity * o.price for o in orders), Decimal(0))
            currency = str(spec["currency"])
            positions.append(
                ProviderPosition(
                    ticker=ticker,
                    isin=str(spec["isin"]),
                    name=str(spec["name"]),
                    quantity=qty,
                    avg_price=(cost_ccy / qty).quantize(Decimal("0.0001")),
                    current_price=sc.price(ticker, self.as_of),
                    instrument_currency=currency,
                    fx_rate=sc.usd_eur(self.as_of) if currency == "USD" else Decimal(1),
                )
            )
        return positions

    def get_cash(self) -> ProviderCash:
        ledger = self._ledger
        deposits = sum(
            (-d.amount for d in ledger.deposits if sc.next_business_day(d.day) <= self.as_of),
            Decimal(0),
        )
        spent = sum((o.value_eur for o in ledger.orders), Decimal(0))
        dividends = sum((d.amount_eur for d in ledger.dividends), Decimal(0))
        free = sc.money(deposits - spent + dividends)
        invested = sc.money(spent)
        value = sum(
            (
                p.quantity * p.current_price * (p.fx_rate or Decimal(1))
                for p in self.get_positions()
            ),
            Decimal(0),
        )
        ppl = sc.money(value - spent)
        return ProviderCash("EUR", free, invested, sc.money(free + invested + ppl), ppl)

    def get_orders(self, since: date) -> list[ProviderOrder]:
        return [
            ProviderOrder(
                external_id=f"ORD-{o.day:%Y%m%d}-{o.seq}",
                executed_at=sc.at_noon_utc(o.day),
                ticker=o.ticker,
                isin=str(sc.INSTRUMENTS[o.ticker]["isin"]),
                side="buy",
                quantity=o.quantity,
                fill_price=o.price,
                instrument_currency=o.currency,
                fx_rate=o.fx_rate,
                value_eur=o.value_eur,
                fees_eur=Decimal("0.00"),
                raw={"mock": True},
            )
            for o in self._ledger.orders
            if o.day >= since
        ]

    def get_dividends(self, since: date) -> list[ProviderDividend]:
        return [
            ProviderDividend(
                external_id=f"DIV-{d.ticker}-{d.day:%Y%m%d}",
                ticker=d.ticker,
                paid_on=d.day,
                quantity=d.quantity,
                gross_per_share=d.per_share,
                amount=d.amount,
                currency=d.currency,
                amount_eur=d.amount_eur,
                withholding_tax=d.withholding,
            )
            for d in self._ledger.dividends
            if d.day >= since
        ]

    def get_pies(self) -> list[ProviderPie]:
        return []

    def get_cash_flows(self, since: date) -> list[ProviderCashFlow]:
        flows = []
        for d in self._ledger.deposits:
            day = sc.next_business_day(d.day)
            if day < since or day > self.as_of:
                continue
            flows.append(
                ProviderCashFlow(
                    external_id=f"DEP-{d.day:%Y%m%d}",
                    type="deposit",
                    occurred_at=sc.at_noon_utc(day),
                    amount=-d.amount,
                    currency="EUR",
                    amount_eur=-d.amount,
                    raw={"mock": True, "reference": f"T212-{d.day:%Y%m%d}"},
                )
            )
        return flows
