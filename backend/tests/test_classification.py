"""Motore di classificazione: pulizia testi, regole, trasferimenti, rimborsi, entrate, override."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from itertools import count
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classification.engine import classify_all, simulate
from app.classification.rules import CompiledRule
from app.classification.text import (
    clean_description,
    contains_phrase,
    match_text,
    merchant_key,
    merchant_source_text,
)
from app.classification.transfers import (
    TransferCandidate,
    business_days_between,
    match_transfers,
)
from app.integrations.mock.scenario import mock_iban
from app.models import (
    Account,
    AccountSource,
    Category,
    IncomeClassification,
    ManualOverride,
    Merchant,
    Subcategory,
    Transaction,
    TransactionRule,
)
from app.models.enums import ClassificationSource, RuleOrigin, TransactionKind
from app.schemas.rules import RuleActions, RuleConditions
from app.schemas.transactions import TransactionCreate, TransactionUpdate
from app.services.transactions import create_manual_transaction, update_transaction
from tests.conftest import make_synced_transaction

MONDAY = date(2026, 9, 14)
_seq = count(1)


# --- Testi ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("PAGAMENTO POS ESSELUNGA MILANO CARTA *4821 DEL 01/02/26", "ESSELUNGA MILANO"),
        ("AMAZON MKTPLACE ACQUISTO CARTA *9907", "AMAZON MKTPLACE"),
        ("  PAGAMENTO\tPOS   BAR \n", "BAR"),
        ("Netflix.com", "Netflix.com"),
        ("PAG. POS 14:32 CAFFE DEL CORSO", "CAFFE DEL CORSO"),
        ("CARTA *1234", "CARTA *1234"),  # tolto tutto: resta l'originale
    ],
)
def test_clean_description(raw: str, clean: str) -> None:
    assert clean_description(raw) == clean


@pytest.mark.parametrize(
    ("raw", "counterparty", "key"),
    [
        ("PAGAMENTO POS BAR MAGENTA MILANO CARTA *4821 DEL 01/02/26", None, "bar-magenta"),
        ("BONIFICO A FAVORE DI ROSSI MARIA CAUS: AFFITTO", "ROSSI MARIA", "rossi-maria"),
        ("ADDEBITO SEPA DD ILIAD ITALIA SPA", None, "iliad"),
        ("Refund from AMAZON.IT", None, "amazon"),
        ("BONIFICO A VOSTRO FAVORE DA ACME S.R.L. CAUS: STIPENDIO", "ACME S.R.L.", "acme"),
        ("PAGOPA UNIVERSITA DEGLI STUDI DI MILANO", None, "universita-degli-studi"),
        ("12345 0001", None, None),
    ],
)
def test_merchant_key(raw: str, counterparty: str | None, key: str | None) -> None:
    assert merchant_key(merchant_source_text(raw, counterparty)) == key


def test_contains_phrase_matches_whole_words_only() -> None:
    text = match_text("Apple.com/bill AMZN Mktp IT")
    assert contains_phrase(text, "apple com bill")
    assert contains_phrase(text, "amzn mktp")
    assert not contains_phrase(text, "app")
    assert not contains_phrase(match_text("ATMOSFERA bar"), "atm")


def test_business_days_between() -> None:
    friday = date(2026, 9, 18)
    assert business_days_between(friday, friday + timedelta(days=3)) == 1  # → lunedì
    assert business_days_between(MONDAY, MONDAY + timedelta(days=1)) == 1
    assert business_days_between(MONDAY, MONDAY + timedelta(days=4)) == 4
    assert business_days_between(MONDAY + timedelta(days=4), MONDAY) == 4


# --- Abbinamento trasferimenti (unitario) ----------------------------------------------------


def _cand(
    id_: int, account: int, day: date, amount: str, text: str = "", **kw: object
) -> TransferCandidate:
    return TransferCandidate(
        id=id_,
        account_id=account,
        booking_date=day,
        amount_eur=Decimal(amount),
        currency=kw.pop("currency", "EUR"),  # type: ignore[arg-type]
        text=match_text(text),
        counterparty_iban=kw.pop("iban", None),  # type: ignore[arg-type]
        **kw,  # type: ignore[arg-type]
    )


def test_match_requires_opposite_amounts_different_accounts_and_close_dates() -> None:
    out = _cand(1, 1, MONDAY, "-10.00", "Ricarica Revolut")
    good = _cand(2, 2, MONDAY + timedelta(days=1), "10.00", "Top-up")
    same_account = _cand(3, 1, MONDAY, "10.00", "Top-up")
    other_amount = _cand(4, 2, MONDAY, "10.01", "Top-up")
    too_late = _cand(5, 2, MONDAY + timedelta(days=4), "10.00", "Top-up")
    matches = match_transfers(
        [out, good, same_account, other_amount, too_late], my_ibans=set(), keywords=["revolut"]
    )
    assert [(m.out_id, m.in_id) for m in matches] == [(1, 2)]
    assert matches[0].confident


def test_match_without_clue_is_only_a_suggestion() -> None:
    matches = match_transfers(
        [_cand(1, 1, MONDAY, "-25.00", "BAR"), _cand(2, 2, MONDAY, "25.00", "Bonifico")],
        my_ibans=set(),
        keywords=["revolut"],
    )
    assert len(matches) == 1
    assert not matches[0].confident


def test_match_with_own_iban_and_fx_tolerance() -> None:
    out = _cand(1, 1, MONDAY, "-100.00", "Bonifico", iban="LT001")
    inc = _cand(2, 2, MONDAY, "98.50", "Transfer", currency="USD")
    matches = match_transfers([out, inc], my_ibans={"LT001"}, keywords=[])
    assert matches[0].reason == "IBAN di un tuo conto"
    # Oltre il 2% non è più lo stesso trasferimento.
    far = _cand(3, 2, MONDAY, "97.00", "Transfer", currency="USD")
    assert match_transfers([out, far], my_ibans={"LT001"}, keywords=[]) == []


def test_match_prefers_clue_then_closest_date() -> None:
    out = _cand(1, 1, MONDAY, "-50.00", "Giroconto")
    near = _cand(2, 2, MONDAY, "50.00", "")
    far = _cand(3, 3, MONDAY + timedelta(days=2), "50.00", "")
    matches = match_transfers([out, far, near], my_ibans=set(), keywords=["giroconto"])
    assert [(m.out_id, m.in_id) for m in matches] == [(1, 2)]


# --- Regole (unitario) ---------------------------------------------------------------------------


def _tx(**kw: object) -> Transaction:
    defaults: dict[str, object] = {
        "id": next(_seq),
        "account_id": 1,
        "amount_eur": Decimal("-9.99"),
        "description_raw": "Apple.com/bill",
        "description_clean": "Apple.com/bill",
        "counterparty_name": None,
        "counterparty_iban": None,
        "mcc": None,
    }
    return Transaction(**(defaults | kw))


def _rule(
    conditions: dict[str, object], origin: str = RuleOrigin.USER, priority: int = 100
) -> CompiledRule:
    return CompiledRule(
        id=next(_seq),
        name="test",
        origin=origin,
        priority=priority,
        conditions=RuleConditions.model_validate(conditions),
        actions=RuleActions(kind=TransactionKind.EXPENSE),
    )


@pytest.mark.parametrize(
    ("conditions", "expected"),
    [
        ({"description_contains": "APPLE.COM"}, True),
        ({"description_contains": "google"}, False),
        ({"description_regex": r"apple\.com/(bill|music)"}, True),
        ({"direction": "out"}, True),
        ({"direction": "in"}, False),
        ({"amount_min": "5", "amount_max": "10"}, True),
        ({"amount_min": "10"}, False),
        ({"amounts": ["0.99", "9.99"]}, True),
        ({"amounts": ["2.99"]}, False),
        ({"account_id": 1}, True),
        ({"account_id": 2}, False),
        ({"merchant_id": 7}, True),
        ({"merchant_id": 8}, False),
        ({"mcc": "5818"}, True),
        ({"counterparty_iban": "it00 x01"}, True),
        ({"description_contains": "apple", "direction": "in"}, False),  # AND
    ],
)
def test_rule_conditions(conditions: dict[str, object], expected: bool) -> None:
    tx = _tx(mcc="5818", counterparty_iban="IT00X01")
    assert _rule(conditions).matches(tx, merchant_id=7) is expected


def test_rules_need_at_least_one_condition_and_valid_regex() -> None:
    with pytest.raises(ValueError, match="almeno una condizione"):
        RuleConditions.model_validate({})
    with pytest.raises(ValueError, match="regolare non valida"):
        RuleConditions.model_validate({"description_regex": "(unclosed"})
    with pytest.raises(ValueError, match="almeno un'azione"):
        RuleActions.model_validate({})


def test_user_rules_come_before_seed_rules() -> None:
    seed = _rule({"direction": "out"}, origin=RuleOrigin.SEED, priority=1)
    user = _rule({"direction": "out"}, origin=RuleOrigin.LEARNED, priority=500)
    assert sorted([seed, user], key=lambda r: r.sort_key) == [user, seed]


# --- Motore sul database --------------------------------------------------------------------------


@pytest.fixture
def two_accounts(seeded: Session) -> tuple[Account, Account]:
    source = AccountSource(provider="mock", institution="Test", display_name="Test")
    seeded.add(source)
    seeded.flush()
    ca = Account(
        source_id=source.id, external_id=f"ca-{next(_seq)}", name="CA", type="checking",
        currency="EUR", institution="Crédit Agricole Italia", iban=mock_iban("IT", 1),
    )  # fmt: skip
    rev = Account(
        source_id=source.id, external_id=f"rev-{next(_seq)}", name="Revolut", type="checking",
        currency="EUR", institution="Revolut", iban=mock_iban("LT", 2),
    )  # fmt: skip
    seeded.add_all([ca, rev])
    seeded.commit()
    return ca, rev


def _code(db: Session, tx: Transaction) -> str | None:
    if tx.category_id is None:
        return None
    category = db.get(Category, tx.category_id)
    assert category is not None
    if tx.subcategory_id is None:
        return category.code
    sub = db.get(Subcategory, tx.subcategory_id)
    assert sub is not None
    return f"{category.code}/{sub.code}"


def _income(db: Session, tx: Transaction) -> str | None:
    income = db.get(IncomeClassification, tx.income_type_id) if tx.income_type_id else None
    return income.code if income else None


def _pair_state(tx: Transaction) -> tuple[int | None, str]:
    return tx.transfer_pair_id, tx.kind


def _classify(db: Session) -> None:
    classify_all(db)
    db.commit()


def test_ten_euro_transferred_five_spent(
    db: Session, two_accounts: tuple[Account, Account]
) -> None:
    """Esempio della SPEC: CA −10 € "Ricarica Revolut" + Revolut +10 € "Top-up" = trasferimento;
    poi Revolut −5 € "Bar" = spesa."""
    ca, rev = two_accounts
    out = make_synced_transaction(
        db, ca, amount="-10.00", description="RICARICA REVOLUT", booking_date=MONDAY
    )
    inc = make_synced_transaction(
        db, rev, amount="10.00", description="Top-up by bank transfer",
        booking_date=MONDAY + timedelta(days=1),
    )  # fmt: skip
    bar = make_synced_transaction(
        db, rev, amount="-5.00", description="Bar Magenta", booking_date=MONDAY + timedelta(days=1),
        mcc="5812",
    )  # fmt: skip
    _classify(db)

    assert out.kind == inc.kind == TransactionKind.INTERNAL_TRANSFER
    assert out.transfer_pair_id == inc.id
    assert inc.transfer_pair_id == out.id
    assert out.category_id is None
    assert out.merchant_id is None
    assert bar.kind == TransactionKind.EXPENSE
    assert _code(db, bar) == "ristoranti"
    # La parola "bar" nella causale basta (regola di sistema), prima ancora dell'MCC.
    assert bar.classification_source == ClassificationSource.RULE


def test_transfer_without_clue_is_proposed_not_applied(
    db: Session, two_accounts: tuple[Account, Account]
) -> None:
    ca, rev = two_accounts
    out = make_synced_transaction(
        db, ca, amount="-37.00", description="PAGAMENTO X", booking_date=MONDAY
    )
    inc = make_synced_transaction(
        db, rev, amount="37.00", description="Payment", booking_date=MONDAY
    )
    _classify(db)
    assert out.kind == TransactionKind.EXPENSE
    assert out.transfer_pair_id is None
    result, _ = simulate(db)
    assert [(s.out_id, s.in_id) for s in result.suggestions] == [(out.id, inc.id)]


def test_manual_pair_and_dismissal(db: Session, two_accounts: tuple[Account, Account]) -> None:
    ca, rev = two_accounts
    out = make_synced_transaction(
        db, ca, amount="-37.00", description="PAGAMENTO X", booking_date=MONDAY
    )
    inc = make_synced_transaction(
        db, rev, amount="37.00", description="Payment", booking_date=MONDAY
    )
    db.add_all(
        [
            ManualOverride(transaction_id=out.id, field="transfer_pair_id", new_value=str(inc.id)),
            ManualOverride(transaction_id=inc.id, field="transfer_pair_id", new_value=str(out.id)),
        ]
    )
    _classify(db)
    assert out.transfer_pair_id == inc.id
    assert out.kind == TransactionKind.INTERNAL_TRANSFER
    assert out.classification_source == ClassificationSource.MANUAL

    # "Non è un trasferimento": override a NULL, niente abbinamento né proposta.
    for o in db.scalars(select(ManualOverride)):
        o.new_value = None
    _classify(db)
    assert _pair_state(out) == (None, TransactionKind.EXPENSE)
    assert simulate(db)[0].suggestions == []


def test_seed_rules(db: Session, two_accounts: tuple[Account, Account]) -> None:
    ca, rev = two_accounts
    expense, fee = TransactionKind.EXPENSE, TransactionKind.FEE
    invest = TransactionKind.INVESTMENT_TRANSFER
    cases = {
        "cloud": (rev, "-0.99", "Apple.com/bill", "abbonamenti/cloud", expense),
        "music": (rev, "-10.99", "Apple.com/bill", "abbonamenti/musica", expense),
        "t212": (ca, "-200.00", "BONIFICO A FAVORE DI TRADING 212 UK", "investimenti", invest),
        "fee": (ca, "-2.00", "CANONE MENSILE CONTO", "altro", fee),
        "bollo": (ca, "-8.55", "IMPOSTA DI BOLLO", "altro", fee),
        "rent": (ca, "-520.00", "BONIFICO A FAVORE DI ROSSI MARIA CAUS: AFFITTO", "casa", expense),
        "uni": (
            ca, "-456.00", "PAGOPA UNIVERSITA DEGLI STUDI DI MILANO",
            "istruzione/tasse_corsi", expense,
        ),
    }  # fmt: skip
    txs = {
        name: make_synced_transaction(db, acc, amount=amount, description=desc)
        for name, (acc, amount, desc, _, _) in cases.items()
    }
    _classify(db)
    for name, (_, _, _, code, kind) in cases.items():
        tx = txs[name]
        assert (_code(db, tx), tx.kind) == (code, kind), name
        assert tx.classification_source == ClassificationSource.RULE
        assert tx.rule_id is not None
        assert tx.classification_note


def test_income_types(db: Session, two_accounts: tuple[Account, Account]) -> None:
    ca, rev = two_accounts
    salary_kw = make_synced_transaction(
        db, ca, amount="1500.00", description="BONIFICO CAUS: STIPENDIO"
    )
    cashback = make_synced_transaction(db, rev, amount="1.20", description="Cashback")
    interest = make_synced_transaction(db, ca, amount="0.35", description="INTERESSI CREDITORI")
    friend = make_synced_transaction(
        db, ca, amount="25.00", description="BONIFICO DA LUCA", counterparty_name="LUCA BIANCHI"
    )
    other = make_synced_transaction(db, rev, amount="3.00", description="Something")
    # Stipendio senza parola chiave: stesso ordinante, 3 mesi, importo stabile.
    recurring = [
        make_synced_transaction(
            db, ca, amount=amount, description="BONIFICO DA ACME", counterparty_name="ACME SRL",
            counterparty_iban=mock_iban("IT", 99), booking_date=day,
        )
        for amount, day in (
            ("1490.00", date(2026, 6, 27)),
            ("1500.00", date(2026, 7, 27)),
            ("1561.00", date(2026, 8, 27)),
        )
    ]  # fmt: skip
    _classify(db)
    assert _income(db, salary_kw) == "salary"
    assert _income(db, cashback) == "cashback"
    assert _income(db, interest) == "interest"
    assert _income(db, friend) == "transfer_received"
    assert _income(db, other) == "other"
    assert all(_income(db, t) == "salary" for t in recurring)
    assert recurring[0].classification_source == ClassificationSource.HEURISTIC


def test_refund_is_linked_to_original_purchase(
    db: Session, two_accounts: tuple[Account, Account]
) -> None:
    _, rev = two_accounts
    purchase = make_synced_transaction(
        db, rev, amount="-29.90", description="ZARA", booking_date=date(2026, 9, 1)
    )
    refund = make_synced_transaction(
        db, rev, amount="29.90", description="Refund from ZARA", booking_date=date(2026, 9, 8)
    )
    partial = make_synced_transaction(
        db, rev, amount="5.00", description="Rimborso parziale ZARA", booking_date=date(2026, 9, 9)
    )
    orphan = make_synced_transaction(db, rev, amount="12.00", description="Refund from SHOP X")
    _classify(db)
    assert refund.kind == TransactionKind.REFUND
    assert refund.refund_of_id == purchase.id
    assert _code(db, refund) == _code(db, purchase) == "vestiti"
    # Il primo acquisto è già rimborsato: il secondo rimborso non trova un'altra spesa.
    assert partial.refund_of_id is None
    assert orphan.kind == TransactionKind.INCOME
    assert _income(db, orphan) == "refund"


def test_merchant_default_category_alias_and_auto_creation(
    db: Session, two_accounts: tuple[Account, Account]
) -> None:
    ca, rev = two_accounts
    esselunga = make_synced_transaction(
        db,
        ca,
        amount="-40.00",
        description="PAGAMENTO POS ESSELUNGA MILANO CARTA *4821 DEL 01/09/26",
    )
    amzn = make_synced_transaction(db, rev, amount="-15.00", description="AMZN Mktp IT")
    shop = make_synced_transaction(
        db, rev, amount="-7.00", description="PAGAMENTO POS LIBRERIA ROSSI MILANO"
    )
    shop2 = make_synced_transaction(db, rev, amount="-8.00", description="LIBRERIA ROSSI")
    _classify(db)

    assert esselunga.classification_source == ClassificationSource.MERCHANT
    assert _code(db, esselunga) == "spesa"
    amazon = db.scalar(select(Merchant).where(Merchant.normalized_key == "amazon"))
    assert amazon is not None
    assert amzn.merchant_id == amazon.id
    assert amzn.classification_source == ClassificationSource.NONE  # Amazon: nessuna categoria
    created = db.get(Merchant, shop.merchant_id)
    assert created is not None
    assert created.origin == "auto"
    assert created.name == "Libreria Rossi"
    assert shop2.merchant_id == created.id


def test_user_rule_beats_seed_rule_and_tracks_matches(
    db: Session, two_accounts: tuple[Account, Account]
) -> None:
    _, rev = two_accounts
    tx = make_synced_transaction(db, rev, amount="-0.99", description="Apple.com/bill")
    regali = db.scalar(select(Category).where(Category.code == "regali"))
    assert regali is not None
    rule = TransactionRule(
        name="Apple → Regali", priority=500, origin=RuleOrigin.USER,
        conditions={"description_contains": "apple.com"}, actions={"category_id": regali.id},
    )  # fmt: skip
    db.add(rule)
    db.commit()
    _classify(db)
    assert tx.rule_id == rule.id
    assert tx.category_id == regali.id
    assert rule.match_count == 1
    assert rule.last_matched_at is not None


def test_manual_override_survives_reclassification(
    db: Session, two_accounts: tuple[Account, Account]
) -> None:
    ca, _ = two_accounts
    tx = make_synced_transaction(db, ca, amount="-40.00", description="ESSELUNGA")
    _classify(db)
    regali = db.scalar(select(Category).where(Category.code == "regali"))
    assert regali is not None
    update_transaction(db, tx, TransactionUpdate(category_id=regali.id))
    db.commit()
    _classify(db)
    _classify(db)
    assert tx.category_id == regali.id
    assert tx.classification_source == ClassificationSource.MANUAL
    assert tx.merchant_id is not None  # il merchant resta riconosciuto


def test_manual_transactions_classified_by_hand_are_never_touched(
    db: Session, two_accounts: tuple[Account, Account]
) -> None:
    ca, _ = two_accounts
    regali = db.scalar(select(Category).where(Category.code == "regali"))
    assert regali is not None
    tx = create_manual_transaction(
        db,
        TransactionCreate(
            account_id=ca.id,
            booking_date=MONDAY,
            amount=Decimal("-40.00"),
            description="ESSELUNGA",
            category_id=regali.id,
        ),
    )
    unclassified = create_manual_transaction(
        db,
        TransactionCreate(
            account_id=ca.id, booking_date=MONDAY, amount=Decimal("-30.00"), description="ESSELUNGA"
        ),
    )
    db.commit()
    _classify(db)
    assert tx.category_id == regali.id
    assert tx.classification_source == ClassificationSource.MANUAL
    assert _code(db, unclassified) == "spesa"  # quello senza categoria invece sì


def test_simulate_does_not_write(db: Session, two_accounts: tuple[Account, Account]) -> None:
    ca, _ = two_accounts
    tx = make_synced_transaction(db, ca, amount="-40.00", description="PAGAMENTO POS NEGOZIO NUOVO")
    merchants_before = db.scalar(select(Merchant.id).order_by(Merchant.id.desc()).limit(1))
    result, _ = simulate(db)
    assert result.decisions[tx.id].kind == TransactionKind.EXPENSE
    assert tx.classification_source == ClassificationSource.NONE
    assert tx.merchant_id is None
    assert db.scalar(select(Merchant.id).order_by(Merchant.id.desc()).limit(1)) == merchants_before


# --- Movimenti veri (2026-10-06): spese divise, giroconti verso te stesso, viaggi -----------


def _kind_code(db: Session, tx: Transaction) -> tuple[str, str | None]:
    return tx.kind, _code(db, tx)


def test_split_expenses_and_money_that_stays_yours(
    db: Session, two_accounts: tuple[Account, Account], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "owner_names", ["Mario Rossi"])
    _, rev = two_accounts
    got = make_synced_transaction(db, rev, amount="20.00", description="From Luca B")
    sent = make_synced_transaction(db, rev, amount="-15.00", description="To Luca B")
    refund = make_synced_transaction(db, rev, amount="9.99", description="Refund from ZARA")
    to_me = make_synced_transaction(
        db, rev, amount="-50.00", description="To Mario Rossi", counterparty_name="Mario Rossi"
    )
    paypal = make_synced_transaction(db, rev, amount="12.00", description="Paypal*rossi Mario")
    topup = make_synced_transaction(
        db, rev, amount="30.00", description="Apple Pay Top-Up by *1234"
    )
    fx = make_synced_transaction(db, rev, amount="5.00", description="Exchanged to EUR")
    _classify(db)

    # Soldi degli amici: rimborsi (riducono le spese), soldi inviati: spese, stessa categoria.
    assert _kind_code(db, got) == (TransactionKind.REFUND, "spese_divise")
    assert _kind_code(db, sent) == (TransactionKind.EXPENSE, "spese_divise")
    # "Refund from" non è un amico: senza l'acquisto originale resta un'entrata (rimborso).
    assert refund.kind == TransactionKind.INCOME
    assert _code(db, refund) is None
    # La controparte sei tu: giroconto, anche se la regola degli amici direbbe altro.
    for tx in (to_me, paypal, topup, fx):
        assert tx.kind == TransactionKind.INTERNAL_TRANSFER, tx.description_raw
        assert tx.category_id is None


def test_card_payments_away_from_home_go_to_travel(
    db: Session, two_accounts: tuple[Account, Account], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "home_places", ["Verona", "Bussolengo", "Bergamo"])
    ca, _ = two_accounts
    pos = "POS CARTA CA DEBIT VISA N. ****1234 DEL 01/10/26 ORE 12:30 C/O "

    def pay(rest: str) -> Transaction:
        return make_synced_transaction(db, ca, amount="-4.50", description=pos + rest)

    home_bar = pay("BAR CENTRALE BUSSOLENGO VR ITA")
    rome_bar = pay("BAR CIARDI ROMA RM ITA")
    rome_mcd = pay("MCD ROMA TERMINI MAR ROMA RM ITA")
    gym = pay("VIRGIN ACTIVE ITALIA SPA MILANO MI ITA")
    online = pay("STEAMPOWERED.COM Bellevue USA")
    train = pay("TRENITALIA - PT WL ROMA RM ITA")
    delivery = pay("Deliveroo Plus Subs MILAN ITA")
    pharmacy = pay("FARMACIA COMUNALE VERONA VR ITA")
    _classify(db)

    assert _code(db, home_bar) == "ristoranti"
    assert _code(db, pharmacy) == "salute"
    assert _code(db, rome_bar) == _code(db, rome_mcd) == "viaggi/cibo"
    assert rome_bar.classification_note == "Pagato fuori casa (BAR CIARDI ROMA RM)"
    # Sede legale nella causale o acquisto online: restano nella loro categoria.
    assert _code(db, gym) == "sport"
    assert _code(db, online) == "giochi"
    assert _code(db, train) == "trasporti/treno"
    assert _code(db, delivery) == "uscite"


def test_known_merchant_beats_generic_keyword(
    db: Session, two_accounts: tuple[Account, Account]
) -> None:
    _, rev = two_accounts
    delivery = make_synced_transaction(db, rev, amount="-18.00", description="DELIVEROO PIZZA")
    _classify(db)
    # "pizza" direbbe Bar e ristoranti, ma Deliveroo ha già la sua categoria.
    assert _code(db, delivery) == "uscite"
    assert delivery.classification_source == ClassificationSource.MERCHANT


def test_trip_days_send_card_payments_without_city_to_travel(
    db: Session, two_accounts: tuple[Account, Account], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "home_places", ["Verona", "Bergamo"])
    ca, rev = two_accounts
    pos = "POS CARTA CA DEBIT VISA N. ****1234 DEL 01/10/26 ORE 12:30 C/O "
    card: dict[str, Any] = {"raw": {"bank_transaction_code": {"code": "CARD_PAYMENT"}}}

    def ca_pay(rest: str, day: int) -> Transaction:
        return make_synced_transaction(
            db, ca, amount="-9.00", description=pos + rest, booking_date=date(2026, 8, day)
        )

    def rev_pay(text: str, day: int, **extra: Any) -> Transaction:
        return make_synced_transaction(
            db, rev, amount="-7.00", description=text, booking_date=date(2026, 8, day), **extra
        )

    rome_lunch = ca_pay("TRATTORIA DA MARIO ROMA RM ITA", 10)
    rome_bus = ca_pay("ATAC TAP&GO ROMA RM ITA", 12)
    museum = rev_pay("Museo Nazionale Romano", 11, **card)
    ice_cream = rev_pay("Ice Cream", 11, **card)  # in mezzo al viaggio, senza città
    netflix = rev_pay("Netflix.com", 11, **card)  # abbonamento: non dipende da dove sei
    friend = rev_pay("To Luca B", 11)  # non è un pagamento con carta
    later = rev_pay("Ice Cream", 20, **card)  # a casa
    _classify(db)

    assert _code(db, rome_lunch) == "viaggi/cibo"
    assert _code(db, rome_bus) == "viaggi/bus_metro"
    assert _code(db, museum) == "viaggi/visite"
    assert _code(db, ice_cream) == "viaggi"
    assert ice_cream.classification_note == "Pagato durante un viaggio (11/08/2026)"
    assert _code(db, netflix) == "abbonamenti/altri_servizi"
    assert _code(db, friend) == "spese_divise"
    assert _code(db, later) is None
