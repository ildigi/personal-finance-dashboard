"""Formule di rendimento (SPEC §13), funzioni pure.

Il rendimento principale è quello **sul capitale versato** (guadagno / versato netto): non
conta mai i versamenti come guadagno ed è quello che si "sente" in tasca.

Il rendimento **annuo ponderato per il denaro** (XIRR) tiene conto di quando hai versato, ma
annualizzare poco capitale rimasto investito per poco tempo gonfia i numeri (un +5% in un
mese diventa "+80% l'anno"; è il tipo di cifra che le app mostrano dopo un versamento). Per
questo si mostra solo se è *affidabile*: almeno un anno di storia e capitale investito in
media per almeno metà del capitale versato attuale (`reliable_mwr`).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

MIN_DAYS_FOR_ANNUAL = 365
MIN_AVERAGE_CAPITAL_SHARE = 0.5


@dataclass(frozen=True)
class Flow:
    day: date
    amount: float  # dal punto di vista dell'investitore: versamento < 0, prelievo/valore > 0


def xirr(flows: list[Flow], *, tolerance: float = 1e-9, max_iter: int = 200) -> float | None:
    """Tasso annuo r tale che Σ amount / (1+r)^(giorni/365) = 0. None se non esiste."""
    if len(flows) < 2:
        return None
    if not any(f.amount < 0 for f in flows) or not any(f.amount > 0 for f in flows):
        return None
    start = min(f.day for f in flows)
    times = [((f.day - start).days / 365.0, f.amount) for f in flows]

    def npv(rate: float) -> float:
        return float(sum(a / (1 + rate) ** t for t, a in times))

    # Bisezione su un intervallo ampio: robusta, e la funzione è monotona per flussi
    # "versamenti prima, valore finale dopo".
    low, high = -0.9999, 1.0
    while npv(high) > 0 and high < 1e6:
        high *= 2
    if npv(low) * npv(high) > 0:
        return None
    for _ in range(max_iter):
        mid = (low + high) / 2
        value = npv(mid)
        if abs(value) < tolerance or (high - low) < tolerance:
            return mid
        if (value > 0) == (npv(low) > 0):
            low = mid
        else:
            high = mid
    return (low + high) / 2


def average_capital(deposits: list[Flow], until: date) -> float:
    """Capitale netto versato medio nel tempo, dal primo versamento a `until`.
    `deposits`: versamenti con importo positivo, prelievi negativo."""
    if not deposits:
        return 0.0
    ordered = sorted(deposits, key=lambda f: f.day)
    start = ordered[0].day
    total_days = (until - start).days
    if total_days <= 0:
        return sum(f.amount for f in ordered)
    area = sum(f.amount * (until - f.day).days for f in ordered)
    return float(area / total_days)


def reliable_mwr(days: int, average: float, net_deposited: float) -> bool:
    """L'XIRR annuo dice qualcosa solo se il capitale è rimasto investito abbastanza a lungo."""
    return (
        days >= MIN_DAYS_FOR_ANNUAL
        and net_deposited > 0
        and average >= net_deposited * MIN_AVERAGE_CAPITAL_SHARE
    )


def period_return(annual_rate: float, days: int) -> float:
    """Da tasso annuo a rendimento del periodo: (1+r)^(giorni/365) − 1."""
    return float((1 + annual_rate) ** (days / 365.0) - 1)


@dataclass(frozen=True)
class Trade:
    day: date
    side: str  # buy | sell
    ticker: str
    quantity: Decimal
    # Effetto sulla liquidità, commissioni comprese (`netValue` di Trading 212): un acquisto
    # costa valore + commissioni, una vendita incassa valore − commissioni.
    value_eur: Decimal
    fees_eur: Decimal = Decimal(0)

    @property
    def gross_eur(self) -> Decimal:
        return (
            self.value_eur - self.fees_eur if self.side == "buy" else self.value_eur + self.fees_eur
        )


def _average_cost_walk(trades: list[Trade], since: date | None) -> tuple[Decimal, Decimal]:
    """Percorre gli ordini col costo medio, sui valori **senza commissioni** (come il P/L
    realizzato di Trading 212; le commissioni si sottraggono a parte).
    Restituisce (realizzato dalle vendite da `since`, costo delle posizioni rimaste aperte)."""
    quantity: dict[str, Decimal] = {}
    cost: dict[str, Decimal] = {}
    realized = Decimal(0)
    for t in sorted(trades, key=lambda t: t.day):
        q = quantity.get(t.ticker, Decimal(0))
        c = cost.get(t.ticker, Decimal(0))
        if t.side == "buy":
            quantity[t.ticker] = q + t.quantity
            cost[t.ticker] = c + t.gross_eur
            continue
        if q <= 0:
            continue
        sold = min(t.quantity, q)
        average = c / q
        if since is None or t.day >= since:
            realized += t.gross_eur - average * sold
        quantity[t.ticker] = q - sold
        cost[t.ticker] = c - average * sold if sold < q else Decimal(0)
    return realized, sum(cost.values(), Decimal(0))


def realized_pl_average_cost(trades: list[Trade], since: date | None = None) -> Decimal:
    """P/L realizzato col metodo del costo medio (quello di Trading 212), senza commissioni:
    a ogni vendita, ricavo − costo medio × quantità venduta. Con `since` contano solo le
    vendite da quel giorno, ma il costo medio tiene conto anche degli acquisti precedenti."""
    realized, _ = _average_cost_walk(trades, since)
    return realized.quantize(Decimal("0.01"))


def open_cost(trades: list[Trade]) -> Decimal:
    """Costo medio (senza commissioni) delle quantità ancora in mano dopo questi ordini."""
    _, cost = _average_cost_walk(trades, None)
    return cost.quantize(Decimal("0.01"))
