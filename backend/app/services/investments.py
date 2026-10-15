"""Calcoli della sezione Investimenti (SPEC §13), tutto in EUR.

- **Data di inizio** (facoltativa, per portafoglio): tutto ciò che è prima si ignora; il
  saldo a quella data, ricostruito dallo storico, vale come capitale di partenza.
- **Valore del conto** = valore delle posizioni + liquidità non investita (ultima istantanea).
- **Capitale netto versato** = saldo di partenza + depositi − prelievi. Interessi e commissioni
  non sono versamenti.
- **Guadagno totale** = valore − capitale netto versato: i versamenti non sono mai guadagno.
- **Rendimento semplice** = guadagno / capitale netto versato.
- **Rendimento ponderato per il denaro** (XIRR): tiene conto di quando hai versato; mostrato
  solo se affidabile (vedi `returns.py`).
- **Solo attivi**: le posizioni in mano, valore − costo (il risultato delle Pie nell'app);
  come Trading 212, la liquidità nelle Pie non ancora investita sta sia nel costo sia nel valore.
- **Scomposizione del guadagno**: non realizzato (posizioni aperte), realizzato (vendite, col
  costo medio), dividendi, interessi, commissioni; "altro" è la differenza (cambi, eventi).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountSource,
    Dividend,
    InvestmentCashFlow,
    InvestmentOrder,
    Pie,
    PieInstrument,
    Portfolio,
    PortfolioCashSnapshot,
    Position,
)
from app.models.enums import CashFlowType, Provider
from app.schemas.investments import (
    ActiveReturns,
    CashFlowRead,
    DividendRead,
    InvestmentActivity,
    InvestmentMonth,
    InvestmentSummary,
    OrderRead,
    PieInstrumentRead,
    PieRead,
    PlBreakdown,
    PortfolioRead,
    PositionRead,
    Returns,
)
from app.services.dates import ROME
from app.services.returns import (
    Flow,
    Trade,
    average_capital,
    open_cost,
    realized_pl_average_cost,
    reliable_mwr,
    xirr,
)

ZERO = Decimal("0.00")
CENT = Decimal("0.01")


def _pct(part: Decimal, whole: Decimal) -> float | None:
    return round(float(part / whole * 100), 2) if whole > 0 else None


# --- Portafogli ---------------------------------------------------------------------------------


def list_portfolios(session: Session) -> list[PortfolioRead]:
    """Prima i conti veri, poi quelli di prova."""
    rows = session.execute(
        select(Portfolio, Account, AccountSource)
        .join(Account, Account.id == Portfolio.account_id)
        .join(AccountSource, AccountSource.id == Account.source_id)
        .order_by(Portfolio.id)
    ).all()
    items = [
        PortfolioRead(
            id=portfolio.id,
            name=source.display_name,
            institution=account.institution,
            is_mock=source.provider == Provider.MOCK,
            source_id=source.id,
            last_sync_at=source.last_sync_at,
            tracking_start=portfolio.tracking_start,
        )
        for portfolio, account, source in rows
    ]
    return sorted(items, key=lambda p: (p.is_mock, p.id))


def set_tracking_start(session: Session, portfolio_id: int, start: date | None) -> None:
    portfolio = session.get(Portfolio, portfolio_id)
    if portfolio is None:
        raise LookupError(portfolio_id)
    portfolio.tracking_start = start
    session.flush()


def _latest_snapshot(session: Session, portfolio_id: int) -> PortfolioCashSnapshot | None:
    return session.scalar(
        select(PortfolioCashSnapshot)
        .where(PortfolioCashSnapshot.portfolio_id == portfolio_id)
        .order_by(PortfolioCashSnapshot.snapshot_at.desc())
        .limit(1)
    )


def _names(session: Session, portfolio_id: int) -> dict[str, str]:
    """Nome leggibile per ticker: dalle posizioni, altrimenti dagli ordini (dato grezzo)."""
    names: dict[str, str] = {}
    for raw in session.scalars(
        select(InvestmentOrder.raw).where(InvestmentOrder.portfolio_id == portfolio_id)
    ):
        instrument = ((raw or {}).get("order") or {}).get("instrument") or {}
        if instrument.get("ticker") and instrument.get("name"):
            names[instrument["ticker"]] = instrument["name"]
    for ticker, name in session.execute(
        select(Position.ticker, Position.name)
        .where(Position.portfolio_id == portfolio_id, Position.name.is_not(None))
        .distinct()
    ):
        if name:
            names[ticker] = name
    return names


# --- Periodo ------------------------------------------------------------------------------------


def _since(start: date | None) -> datetime | None:
    """Inizio del periodo come istante (mezzanotte italiana)."""
    return datetime.combine(start, time.min, tzinfo=ROME) if start else None


def _trades(orders: list[InvestmentOrder]) -> list[Trade]:
    return [
        Trade(
            o.executed_at.astimezone(ROME).date(),
            o.side,
            o.ticker,
            o.quantity,
            o.value_eur,
            o.fees_eur or ZERO,
        )
        for o in orders
    ]


def _orders(session: Session, portfolio_id: int) -> list[InvestmentOrder]:
    return list(
        session.scalars(
            select(InvestmentOrder)
            .where(InvestmentOrder.portfolio_id == portfolio_id)
            .order_by(InvestmentOrder.executed_at, InvestmentOrder.id)
        )
    )


def opening_balance(session: Session, portfolio_id: int, start: date) -> Decimal:
    """Valore al costo del conto all'inizio di `start`, ricostruito dallo storico precedente:
    liquidità (versamenti − prelievi + interessi − commissioni + dividendi − acquisti + vendite,
    con gli ordini al netto delle commissioni come li addebita il broker) più il costo medio,
    senza commissioni, delle posizioni ancora aperte. Le commissioni pagate prima restano
    prima: non pesano sul periodo."""
    since = _since(start)
    cash = ZERO
    for kind, total in session.execute(
        select(InvestmentCashFlow.type, func.sum(InvestmentCashFlow.amount_eur))
        .where(
            InvestmentCashFlow.portfolio_id == portfolio_id,
            InvestmentCashFlow.occurred_at < since,
        )
        .group_by(InvestmentCashFlow.type)
    ):
        sign = -1 if kind in (CashFlowType.WITHDRAWAL, CashFlowType.FEE) else 1
        cash += sign * Decimal(total)
    cash += Decimal(
        session.scalar(
            select(func.coalesce(func.sum(Dividend.amount_eur), 0)).where(
                Dividend.portfolio_id == portfolio_id, Dividend.paid_on < start
            )
        )
        or 0
    )
    before = [o for o in _orders(session, portfolio_id) if since and o.executed_at < since]
    for o in before:
        cash += o.value_eur if o.side == "sell" else -o.value_eur
    return (cash + open_cost(_trades(before))).quantize(CENT)


def _broker_realised(order: InvestmentOrder) -> Decimal | None:
    wallet = ((order.raw or {}).get("fill") or {}).get("walletImpact") or {}
    value = wallet.get("realisedProfitLoss")
    return Decimal(str(value)) if value is not None else None


def realized_since(orders: list[InvestmentOrder], start: date | None) -> Decimal:
    """P/L realizzato dalle vendite dalla data di inizio, senza commissioni.

    Trading 212 indica il realizzato di ogni esecuzione (la somma coincide col suo totale):
    se c'è per tutte le vendite si usa quello. Altrimenti si ricalcola col costo medio su
    tutto lo storico, contando solo le vendite del periodo."""
    since = _since(start)
    sells = [(o, _broker_realised(o)) for o in orders if o.side == "sell"]
    if all(value is not None for _, value in sells):
        return sum(
            (
                value
                for o, value in sells
                if value is not None and (since is None or o.executed_at >= since)
            ),
            ZERO,
        ).quantize(CENT)
    return realized_pl_average_cost(_trades(orders), start)


# --- Riepilogo ----------------------------------------------------------------------------------


def _flows(session: Session, portfolio_id: int, since: datetime | None) -> list[InvestmentCashFlow]:
    query = select(InvestmentCashFlow).where(InvestmentCashFlow.portfolio_id == portfolio_id)
    if since is not None:
        query = query.where(InvestmentCashFlow.occurred_at >= since)
    return list(session.scalars(query))


def _returns(
    flows: list[InvestmentCashFlow],
    opening: Decimal,
    start: date | None,
    value: Decimal,
    net: Decimal,
    today: date,
) -> Returns:
    """Flussi dal punto di vista dell'investitore: il saldo di partenza è un versamento."""
    capital = [
        Flow(
            f.occurred_at.astimezone(ROME).date(),
            -float(f.amount_eur) if f.type == CashFlowType.DEPOSIT else float(f.amount_eur),
        )
        for f in flows
        if f.type in (CashFlowType.DEPOSIT, CashFlowType.WITHDRAWAL)
    ]
    if start is not None and opening > 0:
        capital.append(Flow(start, -float(opening)))
    total_pl = value - net
    first = start if start is not None else min((f.day for f in capital), default=None)
    days = (today - first).days if first else 0
    average = average_capital([Flow(f.day, -f.amount) for f in capital], today)
    rate = xirr([*capital, Flow(today, float(value))]) if capital and value > 0 else None
    reliable = rate is not None and reliable_mwr(days, average, float(net))
    return Returns(
        total_pl_eur=total_pl,
        simple_pct=_pct(total_pl, net),
        mwr_annual_pct=round(rate * 100, 2) if reliable and rate is not None else None,
        average_invested_eur=Decimal(str(round(average, 2))),
        days=days,
    )


def investment_summary(session: Session, portfolio_id: int, today: date) -> InvestmentSummary:
    portfolio = next(p for p in list_portfolios(session) if p.id == portfolio_id)
    start = portfolio.tracking_start
    since = _since(start)
    snapshot = _latest_snapshot(session, portfolio_id)
    positions = (
        list(
            session.scalars(
                select(Position).where(
                    Position.portfolio_id == portfolio_id,
                    Position.snapshot_at == snapshot.snapshot_at,
                )
            )
        )
        if snapshot
        else []
    )
    positions_value = sum((p.market_value_eur for p in positions), ZERO)
    positions_cost = sum((p.cost_basis_eur for p in positions), ZERO)
    cash = snapshot.free if snapshot else ZERO
    value = positions_value + cash

    flows = _flows(session, portfolio_id, since)
    by_type: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for f in flows:
        by_type[f.type] += f.amount_eur
    deposits = by_type[CashFlowType.DEPOSIT]
    withdrawals = by_type[CashFlowType.WITHDRAWAL]
    interest = by_type[CashFlowType.INTEREST]
    opening = opening_balance(session, portfolio_id, start) if start else ZERO
    net = opening + deposits - withdrawals
    returns = _returns(flows, opening, start, value, net, today)

    def dividends_from(day: date | None) -> Decimal:
        query = select(func.coalesce(func.sum(Dividend.amount_eur), 0)).where(
            Dividend.portfolio_id == portfolio_id
        )
        if day is not None:
            query = query.where(Dividend.paid_on >= day)
        return Decimal(session.scalar(query) or 0)

    year_ago = today - timedelta(days=364)
    dividends = dividends_from(start)
    dividends_12m = dividends_from(max(year_ago, start) if start else year_ago)
    orders = _orders(session, portfolio_id)
    period_orders = [o for o in orders if since is None or o.executed_at >= since]
    unrealized = positions_value - positions_cost
    realized = realized_since(orders, start)
    # Le commissioni (es. conversione valuta) sono dentro il valore degli ordini ma non nel
    # costo delle posizioni né nel realizzato: si sottraggono a parte. "Altro" è il resto.
    fees = sum((o.fees_eur or ZERO for o in period_orders), ZERO) + by_type[CashFlowType.FEE]
    explained = unrealized + realized + dividends + interest - fees
    other = returns.total_pl_eur - explained

    pies = _pies(session, portfolio_id)
    # Come Trading 212: la liquidità nelle Pie non ancora investita fa parte della base
    # investita (e del valore) delle Pie e del `totalCost` del conto.
    pie_cash = sum((pie.cash_eur for pie in pies), ZERO)
    pie_of = {i.ticker: pie.name for pie in pies for i in pie.instruments}
    names = _names(session, portfolio_id)
    for pie in pies:
        for instrument in pie.instruments:
            instrument.name = names.get(instrument.ticker)
    position_items = sorted(
        (
            PositionRead(
                ticker=p.ticker,
                name=p.name or names.get(p.ticker),
                isin=p.isin,
                quantity=p.quantity,
                avg_price=p.avg_price,
                current_price=p.current_price,
                instrument_currency=p.instrument_currency,
                cost_eur=p.cost_basis_eur,
                value_eur=p.market_value_eur,
                pl_eur=p.market_value_eur - p.cost_basis_eur,
                pl_pct=_pct(p.market_value_eur - p.cost_basis_eur, p.cost_basis_eur),
                weight_pct=_pct(p.market_value_eur, positions_value) or 0.0,
                pie_name=pie_of.get(p.ticker),
            )
            for p in positions
            if p.quantity > 0
        ),
        key=lambda p: -p.value_eur,
    )
    return InvestmentSummary(
        portfolio=portfolio,
        as_of=snapshot.snapshot_at if snapshot else None,
        value_eur=value,
        positions_value_eur=positions_value,
        positions_cost_eur=positions_cost,
        cash_eur=cash,
        opening_balance_eur=opening,
        deposits_eur=deposits,
        withdrawals_eur=withdrawals,
        net_deposited_eur=net,
        returns=returns,
        active=ActiveReturns(
            value_eur=positions_value + pie_cash,
            cost_eur=positions_cost + pie_cash,
            pl_eur=unrealized,
            pct=_pct(unrealized, positions_cost + pie_cash),
        ),
        breakdown=PlBreakdown(
            unrealized_eur=unrealized,
            realized_eur=realized,
            dividends_eur=dividends,
            interest_eur=interest,
            fees_eur=fees,
            other_eur=other,
        ),
        dividends_12m_eur=dividends_12m,
        dividend_yield_on_cost_pct=_pct(dividends_12m, positions_cost),
        positions=position_items,
        pies=pies,
    )


def _pies(session: Session, portfolio_id: int) -> list[PieRead]:
    pies = []
    for pie in session.scalars(
        select(Pie).where(Pie.portfolio_id == portfolio_id).order_by(Pie.name)
    ):
        instruments = session.scalars(
            select(PieInstrument)
            .where(PieInstrument.pie_id == pie.id)
            .order_by(PieInstrument.expected_share.desc(), PieInstrument.ticker)
        )
        pies.append(
            PieRead(
                id=pie.id,
                name=pie.name,
                cash_eur=pie.cash_eur,
                invested_eur=pie.invested_eur + pie.cash_eur,
                value_eur=pie.value_eur + pie.cash_eur,
                result_eur=pie.result_eur,
                result_pct=_pct(pie.result_eur, pie.invested_eur + pie.cash_eur),
                goal_eur=pie.goal_eur,
                dividend_action=pie.dividend_action,
                instruments=[
                    PieInstrumentRead(
                        ticker=i.ticker,
                        name=None,
                        expected_share_pct=round(float(i.expected_share) * 100, 2),
                        current_share_pct=round(float(i.current_share) * 100, 2),
                        value_eur=i.value_eur,
                        result_eur=i.result_eur,
                    )
                    for i in instruments
                ],
            )
        )
    return pies


# --- Attività -----------------------------------------------------------------------------------


def _month(value: date | datetime) -> str:
    day = value.astimezone(ROME).date() if isinstance(value, datetime) else value
    return f"{day.year:04d}-{day.month:02d}"


def investment_activity(session: Session, portfolio_id: int, limit: int) -> InvestmentActivity:
    """Ordini, dividendi, movimenti e serie mensile dalla data di inizio (se c'è)."""
    portfolio = session.get(Portfolio, portfolio_id)
    start = portfolio.tracking_start if portfolio else None
    since = _since(start)
    names = _names(session, portfolio_id)
    order_query = select(InvestmentOrder).where(InvestmentOrder.portfolio_id == portfolio_id)
    dividend_query = select(Dividend).where(Dividend.portfolio_id == portfolio_id)
    flow_query = select(InvestmentCashFlow).where(InvestmentCashFlow.portfolio_id == portfolio_id)
    snapshot_query = select(PortfolioCashSnapshot.snapshot_at, PortfolioCashSnapshot.free).where(
        PortfolioCashSnapshot.portfolio_id == portfolio_id
    )
    if start is not None and since is not None:
        order_query = order_query.where(InvestmentOrder.executed_at >= since)
        dividend_query = dividend_query.where(Dividend.paid_on >= start)
        flow_query = flow_query.where(InvestmentCashFlow.occurred_at >= since)
        snapshot_query = snapshot_query.where(PortfolioCashSnapshot.snapshot_at >= since)
    orders = list(
        session.scalars(
            order_query.order_by(InvestmentOrder.executed_at.desc(), InvestmentOrder.id.desc())
        )
    )
    dividends = list(
        session.scalars(dividend_query.order_by(Dividend.paid_on.desc(), Dividend.id.desc()))
    )
    flows = list(
        session.scalars(
            flow_query.order_by(InvestmentCashFlow.occurred_at.desc(), InvestmentCashFlow.id.desc())
        )
    )
    snapshots = list(session.execute(snapshot_query))
    position_values: dict[datetime, Decimal] = {
        at: Decimal(total)
        for at, total in session.execute(
            select(Position.snapshot_at, func.sum(Position.market_value_eur))
            .where(Position.portfolio_id == portfolio_id)
            .group_by(Position.snapshot_at)
        )
    }

    months: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    for f in flows:
        months[_month(f.occurred_at)][f.type] += f.amount_eur
    for d in dividends:
        months[_month(d.paid_on)]["dividends"] += d.amount_eur
    for o in orders:
        months[_month(o.executed_at)]["bought" if o.side == "buy" else "sold"] += o.value_eur
    month_value: dict[str, tuple[datetime, Decimal]] = {}
    for at, free in snapshots:
        key = _month(at)
        if key not in month_value or at > month_value[key][0]:
            month_value[key] = (at, free + position_values.get(at, ZERO))

    # Il saldo di partenza entra nel capitale versato del mese di inizio.
    net = opening_balance(session, portfolio_id, start) if start else ZERO
    if start is not None:
        months.setdefault(_month(start), defaultdict(lambda: ZERO))
    series = []
    for key in sorted(set(months) | set(month_value)):
        m = months[key]
        net += m[CashFlowType.DEPOSIT] - m[CashFlowType.WITHDRAWAL]
        series.append(
            InvestmentMonth(
                month=key,
                deposits_eur=m[CashFlowType.DEPOSIT],
                withdrawals_eur=m[CashFlowType.WITHDRAWAL],
                dividends_eur=m["dividends"],
                interest_eur=m[CashFlowType.INTEREST],
                bought_eur=m["bought"],
                sold_eur=m["sold"],
                net_deposited_eur=net,
                value_eur=month_value[key][1] if key in month_value else None,
            )
        )

    return InvestmentActivity(
        orders=[
            OrderRead(
                id=o.id,
                executed_at=o.executed_at,
                ticker=o.ticker,
                name=names.get(o.ticker),
                side=o.side,
                quantity=o.quantity,
                fill_price=o.fill_price,
                instrument_currency=o.instrument_currency,
                value_eur=o.value_eur,
                fees_eur=o.fees_eur,
            )
            for o in orders[:limit]
        ],
        dividends=[
            DividendRead(
                id=d.id,
                paid_on=d.paid_on,
                ticker=d.ticker,
                name=names.get(d.ticker),
                quantity=d.quantity,
                amount_eur=d.amount_eur,
            )
            for d in dividends[:limit]
        ],
        cash_flows=[
            CashFlowRead(
                id=f.id,
                occurred_at=f.occurred_at,
                type=f.type,
                amount_eur=f.amount_eur,
                transaction_id=f.transaction_id,
            )
            for f in flows[:limit]
        ],
        months=series,
    )
