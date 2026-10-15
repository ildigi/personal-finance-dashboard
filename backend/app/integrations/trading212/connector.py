"""Connettore Trading 212 (conto Invest): traduce l'API nelle strutture comuni. SOLO LETTURA.

Scelte di traduzione (verificate sui dati veri, vedi SPEC §13 "Note di implementazione"):
- **liquidità libera** = disponibile + liquidità nelle Pie non ancora investita + riservata
  agli ordini; **valore del conto** = `totalValue` del riepilogo;
- **posizioni**: costo e valore in EUR presi da `walletImpact` (costo ai cambi storici);
- **ordini**: solo quelli con un'esecuzione (`fill`); una riga per esecuzione, quantità
  sempre positiva (il verso è `side`), valore = `netValue`, commissioni = somma delle
  voci di `taxes` (es. commissione di conversione valuta);
- **movimenti di cassa**: depositi e prelievi (capitale versato), interessi sulla liquidità
  e commissioni (parte del rendimento, non versamenti).

Il conto deve essere in EUR: l'API non gestisce i conti multivaluta e la dashboard
ragiona in euro.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Literal

from app.integrations.base import (
    ProviderBrokerAccount,
    ProviderCash,
    ProviderCashFlow,
    ProviderDividend,
    ProviderOrder,
    ProviderPie,
    ProviderPieInstrument,
    ProviderPosition,
)
from app.integrations.trading212.client import Trading212Client, Trading212Error
from app.services.dates import ROME

INSTITUTION = "Trading 212"
ACCOUNT_NAME = "Trading 212 Invest"
CENT = Decimal("0.01")

_FLOW_TYPES: dict[str, Literal["deposit", "withdrawal", "interest", "fee"]] = {
    "DEPOSIT": "deposit",
    "WITHDRAW": "withdrawal",
    "INTEREST_ON_FREE_CASH": "interest",
    "LENDING_INTEREST": "interest",
    "FEE": "fee",
}


def dec(value: Any, default: str = "0") -> Decimal:
    """Numero JSON → Decimal passando dalla stringa (mai da float binario)."""
    if value is None or value == "":
        return Decimal(default)
    return Decimal(str(value))


def money(value: Any) -> Decimal:
    return dec(value).quantize(CENT)


def parse_datetime(value: Any) -> datetime:
    """ISO 8601 (anche con 'Z') o millisecondi dall'epoca → datetime con fuso."""
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=UTC)
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def local_date(value: Any) -> date:
    return parse_datetime(value).astimezone(ROME).date()


class Trading212Connector:
    """Implementa `BrokerConnector`. Le risposte usate più volte restano in memoria per
    tutta la sincronizzazione (i limiti di frequenza sono stretti)."""

    def __init__(self, client: Trading212Client) -> None:
        self.client = client
        self._summary: dict[str, Any] | None = None
        self._positions: list[dict[str, Any]] | None = None

    def close(self) -> None:
        self.client.close()

    # --- Conto e liquidità ------------------------------------------------------------------

    def _account_summary(self) -> dict[str, Any]:
        if self._summary is None:
            summary = self.client.account_summary()
            if summary.get("currency") != "EUR":
                raise Trading212Error(
                    "Il conto Trading 212 non è in EUR: per ora la dashboard gestisce "
                    "solo conti in euro"
                )
            self._summary = summary
        return self._summary

    def get_account(self) -> ProviderBrokerAccount:
        summary = self._account_summary()
        return ProviderBrokerAccount(str(summary["id"]), ACCOUNT_NAME, "EUR", INSTITUTION)

    def get_cash(self) -> ProviderCash:
        summary = self._account_summary()
        cash = summary.get("cash") or {}
        investments = summary.get("investments") or {}
        free = (
            money(cash.get("availableToTrade"))
            + money(cash.get("inPies"))
            + money(cash.get("reservedForOrders"))
        )
        return ProviderCash(
            currency="EUR",
            free=free,
            invested=money(investments.get("totalCost")),
            total=money(summary.get("totalValue")),
            unrealized_pl=money(investments.get("unrealizedProfitLoss")),
            raw=summary,
        )

    # --- Posizioni ----------------------------------------------------------------------------

    def _raw_positions(self) -> list[dict[str, Any]]:
        if self._positions is None:
            self._positions = self.client.positions()
        return self._positions

    def get_positions(self) -> list[ProviderPosition]:
        positions = []
        for p in self._raw_positions():
            instrument = p.get("instrument") or {}
            wallet = p.get("walletImpact") or {}
            quantity = dec(p.get("quantity"))
            current_price = dec(p.get("currentPrice"))
            value = money(wallet.get("currentValue"))
            fx = None
            if instrument.get("currency") == "EUR":
                fx = Decimal(1)
            elif quantity and current_price:
                fx = (value / (quantity * current_price)).quantize(Decimal("0.0000000001"))
            positions.append(
                ProviderPosition(
                    ticker=str(instrument.get("ticker") or p.get("ticker")),
                    isin=instrument.get("isin"),
                    name=instrument.get("name"),
                    quantity=quantity,
                    avg_price=dec(p.get("averagePricePaid")),
                    current_price=current_price,
                    instrument_currency=str(instrument.get("currency") or "EUR"),
                    fx_rate=fx,
                    cost_basis_eur=money(wallet.get("totalCost")),
                    market_value_eur=value,
                    quantity_in_pies=dec(p.get("quantityInPies")),
                )
            )
        return positions

    # --- Storico --------------------------------------------------------------------------------

    @staticmethod
    def _until(
        items: Iterator[dict[str, Any]], since: date, field: str
    ) -> Iterator[dict[str, Any]]:
        """Lo storico arriva dal più recente: ci si ferma al primo elemento prima di `since`."""
        for item in items:
            when = item.get(field)
            if when and local_date(when) < since:
                return
            yield item

    def get_orders(self, since: date) -> list[ProviderOrder]:
        orders = []
        for item in self.client.history_orders():
            order = item.get("order") or {}
            fill = item.get("fill")
            when = (fill or {}).get("filledAt") or order.get("createdAt")
            if when and local_date(when) < since:
                break
            if not fill:
                continue  # annullato o non eseguito
            wallet = fill.get("walletImpact") or {}
            instrument = order.get("instrument") or {}
            fees = sum(
                (abs(money(t.get("quantity"))) for t in wallet.get("taxes") or []), Decimal("0.00")
            )
            orders.append(
                ProviderOrder(
                    external_id=str(fill["id"]),
                    executed_at=parse_datetime(fill["filledAt"]),
                    ticker=str(order.get("ticker") or instrument.get("ticker")),
                    isin=instrument.get("isin"),
                    side="sell" if order.get("side") == "SELL" else "buy",
                    quantity=abs(dec(fill.get("quantity"))),
                    fill_price=dec(fill.get("price")),
                    instrument_currency=str(instrument.get("currency") or "EUR"),
                    fx_rate=dec(wallet["fxRate"]) if wallet.get("fxRate") is not None else None,
                    value_eur=abs(money(wallet.get("netValue"))),
                    fees_eur=fees,
                    raw=item,
                )
            )
        return orders

    def get_dividends(self, since: date) -> list[ProviderDividend]:
        dividends = []
        for d in self._until(self.client.history_dividends(), since, "paidOn"):
            amount = money(d.get("amount"))
            currency = str(d.get("currency") or "EUR")
            dividends.append(
                ProviderDividend(
                    external_id=str(d["reference"]),
                    ticker=str(d.get("ticker") or (d.get("instrument") or {}).get("ticker")),
                    paid_on=local_date(d["paidOn"]),
                    amount=amount,
                    currency=currency,
                    amount_eur=money(d.get("amountInEuro")) if currency != "EUR" else amount,
                    quantity=dec(d["quantity"]) if d.get("quantity") is not None else None,
                    gross_per_share=(
                        dec(d["grossAmountPerShare"])
                        if d.get("grossAmountPerShare") is not None
                        else None
                    ),
                )
            )
        return dividends

    def get_cash_flows(self, since: date) -> list[ProviderCashFlow]:
        flows = []
        for t in self._until(self.client.history_transactions(), since, "dateTime"):
            amount = money(t.get("amount"))
            kind = _FLOW_TYPES.get(str(t.get("type")))
            if kind is None and t.get("type") == "TRANSFER":
                kind = "deposit" if amount > 0 else "withdrawal"
            if kind is None or amount == 0:
                continue
            if t.get("currency", "EUR") != "EUR":
                raise Trading212Error("Movimento di cassa non in EUR: non gestito")
            flows.append(
                ProviderCashFlow(
                    external_id=str(t["reference"]),
                    type=kind,
                    occurred_at=parse_datetime(t["dateTime"]),
                    amount=abs(amount),
                    currency="EUR",
                    amount_eur=abs(amount),
                    raw=t,
                )
            )
        return flows

    # --- Pie ------------------------------------------------------------------------------------

    def get_pies(self) -> list[ProviderPie]:
        pies = []
        for summary in self.client.pies():
            detail = self.client.pie(int(summary["id"]))
            settings = detail.get("settings") or {}
            result = summary.get("result") or {}
            dividends = summary.get("dividendDetails") or {}
            pies.append(
                ProviderPie(
                    external_id=str(summary["id"]),
                    name=str(settings.get("name") or f"Pie {summary['id']}"),
                    icon=settings.get("icon"),
                    goal_eur=money(settings["goal"]) if settings.get("goal") else None,
                    dividend_action=settings.get("dividendCashAction"),
                    cash_eur=money(summary.get("cash")),
                    invested_eur=money(result.get("priceAvgInvestedValue")),
                    value_eur=money(result.get("priceAvgValue")),
                    result_eur=money(result.get("priceAvgResult")),
                    dividends_gained_eur=money(dividends.get("gained")),
                    instruments=[
                        ProviderPieInstrument(
                            ticker=str(i["ticker"]),
                            expected_share=dec(i.get("expectedShare")),
                            current_share=dec(i.get("currentShare")),
                            owned_quantity=dec(i.get("ownedQuantity")),
                            invested_eur=money(
                                (i.get("result") or {}).get("priceAvgInvestedValue")
                            ),
                            value_eur=money((i.get("result") or {}).get("priceAvgValue")),
                            result_eur=money((i.get("result") or {}).get("priceAvgResult")),
                        )
                        for i in detail.get("instruments") or []
                    ],
                    raw={"summary": summary, "settings": settings},
                )
            )
        return pies
