"""Formule di rendimento con casi numerici noti (SPEC §13)."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.services.returns import (
    Flow,
    Trade,
    average_capital,
    open_cost,
    period_return,
    realized_pl_average_cost,
    reliable_mwr,
    xirr,
)

D0 = date(2025, 1, 1)


def test_xirr_single_deposit_one_year() -> None:
    rate = xirr([Flow(D0, -1000), Flow(D0 + timedelta(days=365), 1100)])
    assert rate == pytest.approx(0.10, abs=1e-6)


def test_xirr_ignores_the_size_of_deposits() -> None:
    # Versare di più non è guadagno: 1000 a inizio anno, 1000 a metà, valore finale 2000 = 0%.
    flows = [Flow(D0, -1000), Flow(D0 + timedelta(days=182), -1000)]
    assert xirr([*flows, Flow(D0 + timedelta(days=365), 2000)]) == pytest.approx(0, abs=1e-6)


def test_xirr_rewards_money_that_was_invested_longer() -> None:
    # Guadagno di 100 su 2000 versati: se gran parte era investita da poco, il tasso è più alto.
    early = [Flow(D0, -1900), Flow(D0 + timedelta(days=300), -100)]
    late = [Flow(D0, -100), Flow(D0 + timedelta(days=300), -1900)]
    end = Flow(D0 + timedelta(days=365), 2100)
    assert xirr([*late, end]) > xirr([*early, end])  # type: ignore[operator]


def test_xirr_needs_both_signs() -> None:
    assert xirr([Flow(D0, -100)]) is None
    assert xirr([Flow(D0, -100), Flow(D0 + timedelta(days=10), -5)]) is None


def test_short_periods_are_not_annualized_but_converted_back() -> None:
    # +5% in un mese è "+80% l'anno": la dashboard mostra il +5% del periodo.
    rate = xirr([Flow(D0, -1000), Flow(D0 + timedelta(days=30), 1050)])
    assert rate is not None
    assert rate > 0.7
    assert period_return(rate, 30) == pytest.approx(0.05, abs=1e-6)


def test_realized_pl_average_cost() -> None:
    """I valori sono quelli addebitati/accreditati (commissioni comprese, come `netValue`):
    il realizzato si calcola senza commissioni, che si sottraggono a parte."""
    trades = [
        Trade(D0, "buy", "X", Decimal(10), Decimal(1000)),  # 100 l'una
        Trade(D0 + timedelta(days=1), "buy", "X", Decimal(10), Decimal(1200), Decimal(2)),
        # costo medio senza commissioni = (1000 + 1198) / 20 = 109,90
        Trade(D0 + timedelta(days=2), "sell", "X", Decimal(5), Decimal(650), Decimal(1)),
        Trade(D0 + timedelta(days=3), "sell", "Y", Decimal(1), Decimal(50)),  # mai comprato
    ]
    # ricavo lordo 651 − 109,90 × 5 = 101,50
    assert realized_pl_average_cost(trades) == Decimal("101.50")
    # Dalla data di inizio: solo le vendite da quel giorno, ma col costo medio di prima.
    later = [*trades, Trade(D0 + timedelta(days=10), "sell", "X", Decimal(5), Decimal(600))]
    assert realized_pl_average_cost(later, D0 + timedelta(days=5)) == Decimal("50.50")
    # Restano 10 quote al costo medio di 109,90.
    assert open_cost(later) == Decimal("1099.00")
    assert (
        open_cost([*later, Trade(D0 + timedelta(days=11), "sell", "X", Decimal(10), Decimal(1))])
        == 0
    )


def test_average_capital_and_reliability() -> None:
    today = D0 + timedelta(days=400)
    # Sempre investito: 1000 dal primo giorno.
    steady = [Flow(D0, 1000)]
    assert average_capital(steady, today) == pytest.approx(1000)
    assert reliable_mwr(400, average_capital(steady, today), 1000)
    # Il caso che gonfia l'XIRR: 130 versati, ritirati dopo un mese, 105 rimessi da un mese.
    bursty = [
        Flow(D0, 130),
        Flow(D0 + timedelta(days=30), -130),
        Flow(today - timedelta(days=30), 105),
    ]
    average = average_capital(bursty, today)
    assert average == pytest.approx((130 * 400 - 130 * 370 + 105 * 30) / 400)
    assert not reliable_mwr(400, average, 105)
    # Meno di un anno di storia: mai annualizzato.
    assert not reliable_mwr(200, 1000, 1000)
