"""Scenario dei dati di prova: 15+ mesi di vita finanziaria verosimile.

Proprietà importanti:
- **Deterministico.** Ogni giorno usa un generatore casuale con seme proprio, quindi lo
  stesso giorno produce sempre gli stessi movimenti con gli stessi ID, qualunque sia la
  data in cui si sincronizza: due sync non creano doppioni.
- **Movimenti in sospeso.** I movimenti di oggi e di ieri sono `pending`, con un ID
  provvisorio e una descrizione più corta; dal giorno dopo diventano `booked` con un ID
  nuovo, come fanno molte banche. La pipeline deve riconoscerli senza duplicarli.
- **Coerente tra conti.** Le ricariche CA → Revolut e i versamenti CA → Trading 212
  compaiono su entrambi i lati; il saldo della carta di credito viene addebitato sul conto.

Nessun dato reale: nomi di aziende generici, IBAN fittizi costruiti a runtime.

Due lingue (ADR 0006): causali e negozi cambiano con la lingua dei dati (`it`: negozi
italiani; `en`: catene internazionali); importi, date e classificazione attesa no.
"""

from __future__ import annotations

import math
import random
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from typing import Literal

Locale = Literal["en", "it"]

EPOCH = date(2025, 7, 1)
SEED = "finance-dashboard-mock-v1"
PENDING_DAYS = 2  # oggi e ieri

CA_CONTO = "ca-conto"
CA_CARTA = "ca-carta-credito"
REV_EUR = "revolut-eur"
T212 = "t212-invest"

MONTHS_IT = [
    "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO",
    "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE",
]  # fmt: skip
MONTHS_EN = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
]  # fmt: skip


def mock_iban(country: str, n: int) -> str:
    """IBAN fittizio a zeri (mai un conto reale), es. IT00X…0001."""
    body = ("X" if country == "IT" else "") + str(n).rjust(22 if country == "IT" else 16, "0")
    return f"{country}00{body}"


IBAN_CA = mock_iban("IT", 1)
IBAN_REVOLUT = mock_iban("LT", 2)
IBAN_ACME = mock_iban("IT", 3)
IBAN_T212 = mock_iban("GB", 4)


def money(value: float | Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass
class MockTx:
    account: str
    day: date
    amount: Decimal
    description: str
    pending_description: str | None = None
    counterparty_name: str | None = None
    counterparty_iban: str | None = None
    category: str | None = None  # categoria "del provider" (stile Revolut)
    mcc: str | None = None
    original_amount: Decimal | None = None
    original_currency: str | None = None
    fx_rate: Decimal | None = None
    always_booked: bool = False  # bonifici SEPA: mai in sospeso
    seq: int = 0
    # Classificazione attesa, solo per i test (mai esposta dal connettore):
    # "tipo", "tipo:categoria[/sottocategoria]" oppure "income@tipologia".
    expect: str = "expense"

    def is_pending(self, as_of: date) -> bool:
        return not self.always_booked and (as_of - self.day).days < PENDING_DAYS

    def external_id(self, as_of: date) -> str:
        prefix = "P" if self.is_pending(as_of) else "B"
        return f"{prefix}-{self.account}-{self.day:%Y%m%d}-{self.seq:02d}"


@dataclass
class MockOrder:
    day: date
    ticker: str
    quantity: Decimal
    price: Decimal
    currency: str
    fx_rate: Decimal  # 1 unità di valuta = fx_rate EUR
    value_eur: Decimal
    seq: int = 0


@dataclass
class MockDividend:
    day: date
    ticker: str
    quantity: Decimal
    per_share: Decimal
    currency: str
    amount: Decimal  # netto, in valuta
    amount_eur: Decimal
    withholding: Decimal


@dataclass
class Ledger:
    transactions: dict[str, list[MockTx]] = field(default_factory=lambda: defaultdict(list))
    deposits: list[MockTx] = field(default_factory=list)  # versamenti verso Trading 212
    orders: list[MockOrder] = field(default_factory=list)
    dividends: list[MockDividend] = field(default_factory=list)


OPENING_BALANCES = {
    CA_CONTO: Decimal("2400.00"),
    REV_EUR: Decimal("150.00"),
    CA_CARTA: Decimal("0.00"),
}


def _rng(day: date, salt: str) -> random.Random:
    return random.Random(f"{SEED}|{salt}|{day.isoformat()}")  # noqa: S311  (dati finti)


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _business_day_on_or_before(day: date) -> date:
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day


def next_business_day(day: date) -> date:
    day += timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


def _month_day(day: date, target: int) -> bool:
    """Vero se `day` è il giorno lavorativo che corrisponde al `target` del mese."""
    try:
        wanted = _business_day_on_or_before(day.replace(day=target))
    except ValueError:
        return False
    return day == wanted


# --- Prezzi di mercato finti ------------------------------------------------------------

INSTRUMENTS = {
    "VWCE": {"name": "Vanguard FTSE All-World Acc", "isin": "IE00BK5BQT80", "currency": "EUR", "base": 118.0, "drift": 0.10},
    "AAPL": {"name": "Apple Inc.", "isin": "US0378331005", "currency": "USD", "base": 215.0, "drift": 0.08},
    "ENEL": {"name": "Enel S.p.A.", "isin": "IT0003128367", "currency": "EUR", "base": 6.9, "drift": 0.06},
}  # fmt: skip


def usd_eur(day: date) -> Decimal:
    t = (day - EPOCH).days
    return Decimal(str(round(0.92 + 0.015 * math.sin(t / 45), 4)))


def price(ticker: str, day: date) -> Decimal:
    spec = INSTRUMENTS[ticker]
    t = (day - EPOCH).days / 365
    wave = 0.06 * math.sin(t * 7.3 + len(ticker)) + 0.03 * math.sin(t * 23.1)
    noise = _rng(day, f"px-{ticker}").uniform(-0.008, 0.008)
    value = float(spec["base"]) * math.exp(float(spec["drift"]) * t + wave + noise)  # type: ignore[arg-type]
    return Decimal(str(round(value, 4)))


# --- Generazione ----------------------------------------------------------------------------


@dataclass(frozen=True)
class Texts:
    """Causali e negozi di una lingua. Le liste hanno la stessa lunghezza in ogni lingua:
    le scelte casuali (stesso seme) cadono sulle stesse posizioni, quindi importi e date
    non cambiano."""

    months: list[str]
    salary: str  # {month} {year}
    thirteenth: str
    employer: str
    rent: str  # {month}
    landlord: str
    phone: str
    phone_party: str
    gym: str
    gym_party: str
    deposit: str  # {ref}
    top_up_out: str
    pos: str  # {shop} {day}
    pos_pending: str  # {shop}
    card_balance: str  # {month} {year}
    card_statement: str
    tuition: str
    university: str
    barber: str  # {day}
    barber_pending: str
    account_fee: str
    transit: str
    transit_pending: str
    train: str
    train_pending: str
    card_purchase: str  # {shop}
    refund: str  # {shop}
    amazon: str
    groceries: list[tuple[str, str]]
    bars: list[str]
    coffee: list[str]
    clothes: list[str]
    books: list[str]
    online: list[tuple[str, str]]


TEXTS: dict[Locale, Texts] = {
    "it": Texts(
        months=MONTHS_IT,
        salary="BONIFICO A VOSTRO FAVORE DA ACME S.R.L. CAUS: STIPENDIO {month} {year}",
        thirteenth="BONIFICO A VOSTRO FAVORE DA ACME S.R.L. CAUS: TREDICESIMA",
        employer="ACME S.R.L.",
        rent="BONIFICO A FAVORE DI ROSSI MARIA CAUS: AFFITTO {month}",
        landlord="ROSSI MARIA",
        phone="ADDEBITO SEPA DD ILIAD ITALIA SPA",
        phone_party="ILIAD ITALIA SPA",
        gym="ADDEBITO SEPA DD VIRGIN ACTIVE ITALIA SPA ABBONAMENTO PALESTRA",
        gym_party="VIRGIN ACTIVE ITALIA SPA",
        deposit="BONIFICO A FAVORE DI TRADING 212 UK LTD RIF {ref}",
        top_up_out="GIROCONTO A FAVORE DI REVOLUT BANK UAB RICARICA",
        pos="PAGAMENTO POS {shop} MILANO CARTA *4821 DEL {day:%d/%m/%y}",
        pos_pending="{shop} MILANO",
        card_balance="ADDEBITO SALDO CARTA DI CREDITO {month} {year}",
        card_statement="PAGAMENTO SALDO ESTRATTO CONTO",
        tuition="PAGOPA UNIVERSITA DEGLI STUDI DI MILANO TASSE UNIVERSITARIE",
        university="UNIVERSITA DEGLI STUDI DI MILANO",
        barber="PAGAMENTO POS BARBERIA DA TONI MILANO CARTA *4821 DEL {day:%d/%m/%y}",
        barber_pending="BARBERIA DA TONI",
        account_fee="CANONE MENSILE CONTO",
        transit="ATM Milano",
        transit_pending="ATM MILANO",
        train="Trenitalia",
        train_pending="TRENITALIA",
        card_purchase="{shop} ACQUISTO CARTA *9907",
        refund="Refund from {shop}",
        amazon="AMAZON.IT",
        groceries=[
            ("ESSELUNGA", "5411"),
            ("CONAD", "5411"),
            ("LIDL", "5411"),
            ("CARREFOUR EXPRESS", "5411"),
        ],
        bars=[
            "BAR MAGENTA",
            "CAFFE DEL CORSO",
            "PIZZERIA DA GINO",
            "BIRRIFICIO LAMBRATE",
            "SUSHI KO",
        ],
        coffee=["CAFFE SPRINT", "COFFEE CORNER"],
        clothes=["ZARA", "H&M", "DECATHLON"],
        books=["LA FELTRINELLI", "AMAZON.IT"],
        online=[("AMAZON MKTPLACE", "5999"), ("MEDIAWORLD", "5732"), ("IKEA", "5712")],
    ),
    # Banca italiana con causali in inglese: la demo si legge tutta in inglese. Ricariche e
    # saldo della carta usano parole che i giroconti riconoscono già ("revolut", "transfer
    # to"; non "from", che è dei bonifici tra amici): la classificazione dei dati veri non
    # cambia.
    "en": Texts(
        months=MONTHS_EN,
        salary="SEPA CREDIT TRANSFER FROM ACME LTD REF: SALARY {month} {year}",
        thirteenth="SEPA CREDIT TRANSFER FROM ACME LTD REF: 13TH MONTH SALARY",
        employer="ACME LTD",
        rent="SEPA TRANSFER TO JANE SMITH REF: RENT {month}",
        landlord="JANE SMITH",
        phone="SEPA DIRECT DEBIT VODAFONE LTD",
        phone_party="VODAFONE LTD",
        gym="SEPA DIRECT DEBIT VIRGIN ACTIVE LTD GYM MEMBERSHIP",
        gym_party="VIRGIN ACTIVE LTD",
        deposit="SEPA TRANSFER TO TRADING 212 UK LTD REF {ref}",
        top_up_out="INTERNAL TRANSFER TO REVOLUT BANK UAB TOP-UP",
        pos="POS {shop} MILAN {day:%d/%m/%y} ****4821",
        pos_pending="{shop} MILAN",
        card_balance="CREDIT CARD BALANCE {month} {year}",
        card_statement="STATEMENT BALANCE PAYMENT - TRANSFER TO CARD",
        tuition="UNIVERSITY OF MILAN TUITION FEES",
        university="UNIVERSITY OF MILAN",
        barber="POS BARBER SHOP {day:%d/%m/%y} ****4821",
        barber_pending="BARBER SHOP",
        account_fee="MONTHLY ACCOUNT FEE",
        transit="ATM Milan",
        transit_pending="ATM MILAN",
        train="Trainline",
        train_pending="TRAINLINE",
        card_purchase="{shop} CARD PURCHASE ****9907",
        refund="Refund from {shop}",
        amazon="AMAZON.EU",
        groceries=[
            ("LIDL", "5411"),
            ("ALDI", "5411"),
            ("CARREFOUR EXPRESS", "5411"),
            ("SPAR", "5411"),
        ],
        bars=["THE CORNER PUB", "FIVE GUYS", "PIZZA EXPRESS", "HARD ROCK CAFE", "WAGAMAMA"],
        coffee=["STARBUCKS", "COSTA COFFEE"],
        clothes=["ZARA", "H&M", "DECATHLON"],
        books=["WATERSTONES", "AMAZON.EU"],
        online=[("AMAZON MKTPLACE", "5999"), ("MEDIAMARKT", "5732"), ("IKEA", "5712")],
    ),
}


def _generate(as_of: date, locale: Locale) -> Ledger:
    t_ = TEXTS[locale]
    ledger = Ledger()
    tx = ledger.transactions
    card_by_month: dict[tuple[int, int], Decimal] = defaultdict(Decimal)
    amazon_purchases: list[MockTx] = []

    for day in _days(EPOCH, as_of):
        r = _rng(day, "day")
        wd = day.weekday()

        # --- Conto CA --------------------------------------------------------------------
        if _month_day(day, 3):
            amount = money(1500 + r.choice([0, 0, 0, 25.4, -12.8, 61.2]))
            tx[CA_CONTO].append(MockTx(
                CA_CONTO, day, amount,
                t_.salary.format(month=t_.months[day.month - 1], year=day.year),
                counterparty_name=t_.employer, counterparty_iban=IBAN_ACME, always_booked=True,
                expect="income@salary",
            ))  # fmt: skip
            if day.month == 12:
                tx[CA_CONTO].append(MockTx(
                    CA_CONTO, day, money(1500), t_.thirteenth,
                    counterparty_name=t_.employer, counterparty_iban=IBAN_ACME, always_booked=True,
                    expect="income@salary",
                ))  # fmt: skip
        if _month_day(day, 1):
            tx[CA_CONTO].append(MockTx(
                CA_CONTO, day, money(-520), t_.rent.format(month=t_.months[day.month - 1]),
                counterparty_name=t_.landlord, always_booked=True, expect="expense:casa",
            ))  # fmt: skip
        if _month_day(day, 10):
            tx[CA_CONTO].append(MockTx(
                CA_CONTO, day, money(-9.99), t_.phone, counterparty_name=t_.phone_party,
                always_booked=True, expect="expense:abbonamenti/altri_servizi",
            ))  # fmt: skip
        if _month_day(day, 2):
            tx[CA_CONTO].append(MockTx(
                CA_CONTO, day, money(-29.90), t_.gym,
                counterparty_name=t_.gym_party, always_booked=True, expect="expense:sport",
            ))  # fmt: skip
        deposit = None
        if _month_day(day, 5):
            deposit = money(200)
        elif _month_day(day, 20) and r.random() < 0.35:
            deposit = money(100)
        if deposit is not None:
            ref = f"T212-{day:%Y%m%d}"
            out = MockTx(
                CA_CONTO, day, -deposit, t_.deposit.format(ref=ref),
                counterparty_name="Trading 212 UK Ltd", counterparty_iban=IBAN_T212, always_booked=True,
                expect="investment_transfer:investimenti",
            )  # fmt: skip
            tx[CA_CONTO].append(out)
            ledger.deposits.append(out)
        if wd == 0:  # lunedì: ricarica Revolut
            top_up = money(r.choice([50, 60, 60, 70, 70, 80]))
            tx[CA_CONTO].append(MockTx(
                CA_CONTO, day, -top_up, t_.top_up_out,
                counterparty_name="Revolut Bank UAB", counterparty_iban=IBAN_REVOLUT, always_booked=True,
                expect="internal_transfer",
            ))  # fmt: skip
            tx[REV_EUR].append(MockTx(
                REV_EUR, next_business_day(day), top_up, "Top-up by bank transfer from CREDIT AGRICOLE ITALIA",
                counterparty_name="CREDIT AGRICOLE ITALIA", counterparty_iban=IBAN_CA,
                category="transfers", always_booked=True, expect="internal_transfer",
            ))  # fmt: skip
        if wd in (1, 5) and r.random() < 0.75:
            shop, mcc = r.choice(t_.groceries)
            amount = money(-r.uniform(14, 78))
            tx[CA_CONTO].append(MockTx(
                CA_CONTO, day, amount, t_.pos.format(shop=shop, day=day),
                pending_description=t_.pos_pending.format(shop=shop), mcc=mcc, expect="expense:spesa",
            ))  # fmt: skip
        if _month_day(day, 15):
            prev = day.replace(day=1) - timedelta(days=1)
            total = card_by_month.get((prev.year, prev.month), Decimal(0))
            if total > 0:
                tx[CA_CONTO].append(MockTx(
                    CA_CONTO, day, -total, t_.card_balance.format(month=t_.months[prev.month - 1], year=prev.year),
                    always_booked=True, expect="internal_transfer",
                ))  # fmt: skip
                tx[CA_CARTA].append(MockTx(
                    CA_CARTA, day, total, t_.card_statement, always_booked=True,
                    expect="internal_transfer",
                ))  # fmt: skip
        if (day.month, day.day) in {(10, 20), (3, 20)}:
            fee = money(456.00 if day.month == 10 else 382.50)
            tx[CA_CONTO].append(MockTx(
                CA_CONTO, day, -fee, t_.tuition,
                counterparty_name=t_.university, always_booked=True,
                expect="expense:istruzione/tasse_corsi",
            ))  # fmt: skip
        if day.toordinal() % 41 == 7:
            tx[CA_CONTO].append(MockTx(
                CA_CONTO, day, money(-18.00), t_.barber.format(day=day),
                pending_description=t_.barber_pending, mcc="7230", expect="expense:cura_persona",
            ))  # fmt: skip
        if (day + timedelta(days=1)).day == 1:
            tx[CA_CONTO].append(MockTx(
                CA_CONTO, day, money(-2.00), t_.account_fee, always_booked=True,
                expect="fee:altro",
            ))  # fmt: skip

        # --- Revolut ------------------------------------------------------------------------
        if day.day == 1:
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(-22.00), t_.transit, pending_description=t_.transit_pending,
                category="transport", mcc="4111", expect="expense:trasporti/bus",
            ))  # fmt: skip
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(r.uniform(0.4, 3.2)), "Cashback", category="cashback", always_booked=True,
                expect="income@cashback",
            ))  # fmt: skip
        if day.day == 8:
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(-0.99), "Apple.com/bill", pending_description="APPLE.COM/BILL",
                category="services", mcc="5818", expect="expense:abbonamenti/cloud",
            ))  # fmt: skip
        if day.day == 12:
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(-10.99), "Apple.com/bill", pending_description="APPLE.COM/BILL",
                category="services", mcc="5818", expect="expense:abbonamenti/musica",
            ))  # fmt: skip
        if day.day == 18:
            rate = usd_eur(day)
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, -money(Decimal(20) * rate), "OpenAI *ChatGPT Subscription",
                pending_description="OPENAI", category="services", mcc="5734",
                original_amount=money(-20), original_currency="USD", fx_rate=rate,
                expect="expense:abbonamenti/software",
            ))  # fmt: skip
        if day.day == 22:
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(-6.99), "Netflix.com", pending_description="NETFLIX.COM",
                category="entertainment", mcc="4899", expect="expense:abbonamenti/altri_servizi",
            ))  # fmt: skip
        if wd in (4, 5) and r.random() < 0.65:
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(-r.uniform(3.5, 34)), r.choice(t_.bars), category="restaurants", mcc="5812",
                expect="expense:ristoranti",
            ))  # fmt: skip
        if wd < 5 and day.month not in (8,) and r.random() < 0.5:
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(-r.choice([1.0, 1.2, 1.5, 2.0, 2.5])), r.choice(t_.coffee),
                category="restaurants", mcc="5814", expect="expense:ristoranti",
            ))  # fmt: skip
        if r.random() < 0.07:
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(-r.choice([9.90, 12.90, 19.90, 34.50])), t_.train,
                pending_description=t_.train_pending, category="transport", mcc="4112",
                expect="expense:trasporti/treno",
            ))  # fmt: skip
        if r.random() < 0.025:
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(-r.uniform(25, 80)), r.choice(t_.clothes), category="shopping", mcc="5651",
                expect="expense:vestiti",
            ))  # fmt: skip
        if day.month in (2, 3, 9, 10) and r.random() < 0.05:
            shop = r.choice(t_.books)
            item = MockTx(
                REV_EUR, day, money(-r.uniform(12, 45)), shop, category="shopping", mcc="5942",
                expect="expense:istruzione/libri",
            )  # fmt: skip
            tx[REV_EUR].append(item)
            if shop == t_.amazon:
                amazon_purchases.append(item)
        if day.month == 12 and 8 <= day.day <= 22 and r.random() < 0.3:
            item = MockTx(
                REV_EUR,
                day,
                money(-r.uniform(15, 60)),
                t_.amazon,
                category="shopping",
                mcc="5942",
                expect="expense:regali",  # regali di Natale: dai dati non si capisce
            )
            tx[REV_EUR].append(item)
            amazon_purchases.append(item)
        if day.month in (7, 8) and r.random() < 0.06:
            what = r.choice([("Ryanair", 60, 140, "4511"), ("Booking.com", 120, 310, "7011")])
            tx[REV_EUR].append(MockTx(
                REV_EUR, day, money(-r.uniform(what[1], what[2])), what[0], category="travel", mcc=what[3],
                expect="expense:viaggi",
            ))  # fmt: skip

        # --- Carta di credito CA ----------------------------------------------------------------
        if r.random() < 0.09:
            shop, mcc = r.choice(t_.online)
            amount = money(-r.uniform(15, 120))
            tx[CA_CARTA].append(MockTx(
                CA_CARTA, day, amount, t_.card_purchase.format(shop=shop), pending_description=shop, mcc=mcc,
            ))  # fmt: skip
            card_by_month[(day.year, day.month)] += -amount

    # Rimborsi: una parte degli acquisti Amazon torna indietro dopo 5-12 giorni.
    for purchase in amazon_purchases:
        r = _rng(purchase.day, "refund")
        if r.random() < 0.25:
            when = purchase.day + timedelta(days=r.randint(5, 12))
            if when <= as_of:
                tx[REV_EUR].append(MockTx(
                    REV_EUR, when, -purchase.amount, t_.refund.format(shop=t_.amazon), category="shopping",
                    always_booked=True, expect=purchase.expect.replace("expense", "refund", 1),
                ))  # fmt: skip

    # Niente movimenti futuri (es. ricarica accreditata il giorno lavorativo successivo).
    for account, items in tx.items():
        tx[account] = [t for t in items if t.day <= as_of]

    # Ordine stabile e numerazione per conto e giorno (gli ID dipendono da questa).
    for items in tx.values():
        items.sort(key=lambda t: (t.day, t.description, t.amount))
        counters: dict[date, int] = defaultdict(int)
        for item in items:
            counters[item.day] += 1
            item.seq = counters[item.day]

    _generate_broker(ledger, as_of)
    return ledger


def _generate_broker(ledger: Ledger, as_of: date) -> None:
    """Ogni versamento viene investito il giorno lavorativo successivo."""
    holdings: dict[str, Decimal] = defaultdict(Decimal)
    for deposit in ledger.deposits:
        day = next_business_day(deposit.day)
        if day > as_of:
            continue
        r = _rng(day, "orders")
        budget = -deposit.amount
        plan = [("VWCE", Decimal("0.7")), (r.choice(["AAPL", "ENEL"]), Decimal("0.25"))]
        for seq, (ticker, share) in enumerate(plan, start=1):
            currency = str(INSTRUMENTS[ticker]["currency"])
            px = price(ticker, day)
            fx = usd_eur(day) if currency == "USD" else Decimal(1)
            value_eur = money(budget * share)
            qty = (value_eur / (px * fx)).quantize(Decimal("0.00000001"))
            ledger.orders.append(MockOrder(day, ticker, qty, px, currency, fx, value_eur, seq))
            holdings[ticker] += qty

    # Dividendi: AAPL trimestrale, ENEL semestrale, sulle quantità possedute in quel momento.
    for day in _days(EPOCH, as_of):
        for ticker, months, per_share in (
            ("AAPL", (2, 5, 8, 11), "0.26"),
            ("ENEL", (1, 7), "0.23"),
        ):
            if day.month in months and day.day == 15:
                qty = sum(
                    (o.quantity for o in ledger.orders if o.ticker == ticker and o.day < day),
                    Decimal(0),
                )
                if qty <= 0:
                    continue
                currency = str(INSTRUMENTS[ticker]["currency"])
                gross = qty * Decimal(per_share)
                withholding = money(
                    gross * (Decimal("0.15") if currency == "USD" else Decimal("0.26"))
                )
                net = money(gross) - withholding
                fx = usd_eur(day) if currency == "USD" else Decimal(1)
                if net > 0:
                    ledger.dividends.append(MockDividend(
                        day, ticker, qty, Decimal(per_share), currency, net, money(net * fx), withholding,
                    ))  # fmt: skip


@lru_cache(maxsize=8)
def ledger_for(as_of: date, locale: Locale = "it") -> Ledger:
    return _generate(as_of, locale)


def at_noon_utc(day: date) -> datetime:
    return datetime.combine(day, time(12, 0), tzinfo=UTC)
