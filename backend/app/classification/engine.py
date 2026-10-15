"""Motore di classificazione (SPEC §11). Pipeline, in ordine di priorità:

1. correzione manuale (`manual_overrides`): vince sempre;
2. trasferimento interno (abbinamento tra due tuoi conti) o versamento al broker;
3. regole tue (`user`, `learned`), per priorità;
4. regole di sistema (`seed`);
5. categoria predefinita del merchant;
6. MCC / categoria del provider;
7. altrimenti: da classificare (`classification_source = none`).

Poi due euristiche sulle entrate: collegamento dei rimborsi alla spesa originale e
tipologia di entrata (stipendio ricorrente, bonifico ricevuto, ...).

La classificazione è **ricalcolata da zero** su tutti i movimenti: il risultato dipende
solo dai dati, dalle regole e dalle correzioni, mai dall'ordine delle sincronizzazioni.
Ogni movimento registra `classification_source`, `rule_id` e una nota leggibile, così
nella UI si vede perché ha quella categoria. I movimenti inseriti a mano e classificati
a mano non vengono mai toccati.
"""

from __future__ import annotations

import itertools
import logging
import re
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.classification.paypal import PaypalCandidate, link_paypal
from app.classification.places import (
    card_location,
    home_keys,
    is_away,
    is_owner,
    is_paypal_to_owner,
    owner_keys,
)
from app.classification.provider_map import (
    CategoryRef,
    category_for_mcc,
    category_for_provider,
)
from app.classification.rules import CompiledRule, first_match
from app.classification.text import (
    clean_description,
    contains_phrase,
    match_text,
    merchant_display_name,
    merchant_key,
    merchant_source_text,
)
from app.classification.transfers import (
    DEFAULT_KEYWORDS,
    MAX_BUSINESS_DAYS,
    TransferCandidate,
    TransferMatch,
    business_days_between,
    match_transfers,
    normalize_iban,
)
from app.core.config import get_settings
from app.models import (
    Account,
    Category,
    IncomeClassification,
    InvestmentCashFlow,
    ManualOverride,
    Merchant,
    Portfolio,
    Subcategory,
    Tag,
    Transaction,
    TransactionRule,
    TransactionTag,
)
from app.models.enums import (
    AccountType,
    CashFlowType,
    ClassificationSource,
    IncomeType,
    MerchantOrigin,
    OverrideField,
    RuleOrigin,
    TagSource,
    TransactionKind,
)
from app.recurring.service import RecurringRefresh, refresh_recurring
from app.services.transactions import default_kind

log = logging.getLogger(__name__)

#: Tipi di movimento che hanno una categoria di spesa.
SPENDING_KINDS = frozenset({TransactionKind.EXPENSE, TransactionKind.FEE})
#: Finestra in cui cercare la spesa originale di un rimborso.
REFUND_WINDOW_DAYS = 90
#: Stipendio: almeno 3 mesi diversi dallo stesso ordinante, importo entro ±15% della mediana.
SALARY_MIN_MONTHS = 3
SALARY_TOLERANCE = Decimal("0.15")

_REFUND_RE = re.compile(r"\b(refund|rimborso|rimborsi|storno|stornato|reso|chargeback)\b", re.I)
_DIVIDEND_RE = re.compile(r"\b(dividend[oi]?|dividends|cedola)\b", re.I)
_TRANSFER_IN_RE = re.compile(r"\b(bonifico|bonif|sepa credit|transfer from|giroconto)\b", re.I)

_MANUAL_PAIR = "abbinato a mano"

_CLASSIFICATION_OVERRIDES = frozenset(
    {
        OverrideField.KIND,
        OverrideField.CATEGORY_ID,
        OverrideField.SUBCATEGORY_ID,
        OverrideField.INCOME_TYPE_ID,
        OverrideField.MERCHANT_ID,
    }
)


@dataclass
class Decision:
    kind: str
    merchant_id: int | None = None
    category_id: int | None = None
    subcategory_id: int | None = None
    income_type_id: int | None = None
    source: str = ClassificationSource.NONE
    rule_id: int | None = None
    note: str | None = None
    transfer_pair_id: int | None = None
    refund_of_id: int | None = None
    rule_tag_ids: frozenset[int] = frozenset()
    # Tipo deciso da trasferimento, regola o correzione: le euristiche non lo cambiano.
    kind_locked: bool = False
    # Pagato fuori casa (città nella causale): quel giorno eri in viaggio.
    away: bool = False


@dataclass
class ClassificationResult:
    total: int = 0
    changed: int = 0
    locked_manual: int = 0
    transfer_pairs: int = 0
    investment_links: int = 0
    refunds_linked: int = 0
    merchants_created: int = 0
    by_source: dict[str, int] = field(default_factory=dict)
    suggestions: list[TransferMatch] = field(default_factory=list)
    decisions: dict[int, Decision] = field(default_factory=dict)
    # Per l'anteprima: movimenti che soddisfano le condizioni della regola provata.
    preview_matches: set[int] = field(default_factory=set)
    recurring: RecurringRefresh | None = None

    @property
    def auto_classified(self) -> int:
        return sum(
            n
            for source, n in self.by_source.items()
            if source not in (ClassificationSource.NONE, ClassificationSource.MANUAL)
        )


@dataclass
class _Context:
    transactions: list[Transaction]
    by_id: dict[int, Transaction]
    accounts: dict[int, Account]
    my_ibans: set[str]
    overrides: dict[int, dict[str, str | None]]
    rules: list[CompiledRule]
    merchants: dict[int, Merchant]
    alias_index: list[tuple[str, int]]
    key_index: dict[str, int]
    categories: dict[int, Category]
    category_by_code: dict[str, Category]
    subcategories: dict[int, Subcategory]
    sub_by_code: dict[tuple[str, str], Subcategory]
    income_types: dict[int, IncomeClassification]
    income_by_code: dict[str, IncomeClassification]
    tag_ids: set[int]
    cash_flows: list[InvestmentCashFlow]
    broker_names: list[str]
    keywords: list[str]
    owners: list[frozenset[str]] = field(default_factory=list)
    homes: list[str] = field(default_factory=list)


# --- Caricamento -----------------------------------------------------------------------


def _load_rules(
    session: Session, extra_rule: CompiledRule | None, replace_rule_id: int | None
) -> list[CompiledRule]:
    rules: list[CompiledRule] = []
    for model in session.scalars(select(TransactionRule).where(TransactionRule.is_active)):
        if model.id == replace_rule_id:
            continue
        try:
            rules.append(CompiledRule.from_model(model))
        except (ValidationError, re.error):
            log.warning("Regola %s non valida: ignorata", model.id)
    if extra_rule is not None:
        rules.append(extra_rule)
    return sorted(rules, key=lambda r: r.sort_key)


def _load_context(
    session: Session, extra_rule: CompiledRule | None, replace_rule_id: int | None
) -> _Context:
    transactions = list(
        session.scalars(select(Transaction).order_by(Transaction.booking_date, Transaction.id))
    )
    accounts = {a.id: a for a in session.scalars(select(Account))}

    overrides: dict[int, dict[str, str | None]] = defaultdict(dict)
    for o in session.scalars(select(ManualOverride)):
        overrides[o.transaction_id][o.field] = o.new_value

    merchants = {m.id: m for m in session.scalars(select(Merchant))}
    alias_index = sorted(
        {
            (phrase, m.id)
            for m in merchants.values()
            for phrase in (match_text(a) for a in m.aliases or [])
            if phrase
        },
        key=lambda item: (-len(item[0]), item[1]),
    )

    categories = {c.id: c for c in session.scalars(select(Category))}
    subcategories = {s.id: s for s in session.scalars(select(Subcategory))}
    income_types = {i.id: i for i in session.scalars(select(IncomeClassification))}

    broker_account_ids = {a.id for a in accounts.values() if a.type == AccountType.BROKER}
    broker_names = sorted(
        {
            match_text(text)
            for a in accounts.values()
            if a.id in broker_account_ids
            for text in (a.institution, a.name)
            if text
        }
    )
    portfolio_ids = set(
        session.scalars(select(Portfolio.id).where(Portfolio.account_id.in_(broker_account_ids)))
    )

    return _Context(
        transactions=transactions,
        by_id={t.id: t for t in transactions},
        accounts=accounts,
        my_ibans={i for i in (normalize_iban(a.iban) for a in accounts.values()) if i},
        overrides=overrides,
        rules=_load_rules(session, extra_rule, replace_rule_id),
        merchants=merchants,
        alias_index=alias_index,
        key_index={m.normalized_key: m.id for m in merchants.values()},
        categories=categories,
        category_by_code={c.code: c for c in categories.values() if c.code},
        subcategories=subcategories,
        sub_by_code={
            (categories[s.category_id].code or "", s.code): s
            for s in subcategories.values()
            if s.code and s.category_id in categories
        },
        income_types=income_types,
        income_by_code={i.code: i for i in income_types.values()},
        tag_ids=set(session.scalars(select(Tag.id))),
        cash_flows=list(
            session.scalars(
                select(InvestmentCashFlow)
                .where(
                    InvestmentCashFlow.portfolio_id.in_(portfolio_ids),
                    # Solo i versamenti hanno un bonifico corrispondente in banca.
                    InvestmentCashFlow.type.in_(
                        [CashFlowType.DEPOSIT.value, CashFlowType.WITHDRAWAL.value]
                    ),
                )
                .order_by(InvestmentCashFlow.occurred_at, InvestmentCashFlow.id)
            )
        ),
        broker_names=[n for n in broker_names if n],
        keywords=[*DEFAULT_KEYWORDS, *get_settings().owner_names],
        owners=owner_keys(get_settings().owner_names),
        homes=home_keys(get_settings().home_places),
    )


# --- Aiuti ----------------------------------------------------------------------------------


def _tx_text(tx: Transaction) -> str:
    return match_text(f"{tx.description_raw} {tx.counterparty_name or ''}")


def _resolve_merchant(ctx: _Context, tx: Transaction) -> int | None:
    text = _tx_text(tx)
    for phrase, merchant_id in ctx.alias_index:
        if contains_phrase(text, phrase):
            return merchant_id
    key = merchant_key(merchant_source_text(tx.description_raw, tx.counterparty_name))
    return ctx.key_index.get(key) if key else None


def _as_int(value: str | None) -> int | None:
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def _category_pair(
    ctx: _Context, category_id: int | None, subcategory_id: int | None
) -> tuple[int | None, int | None]:
    """Coppia valida: la sottocategoria vince e determina la categoria."""
    sub = ctx.subcategories.get(subcategory_id) if subcategory_id is not None else None
    if sub is not None:
        return sub.category_id, sub.id
    if category_id is not None and category_id in ctx.categories:
        return category_id, None
    return None, None


def _ref_to_ids(ctx: _Context, ref: CategoryRef) -> tuple[int | None, int | None]:
    category = ctx.category_by_code.get(ref[0])
    if category is None or category.is_archived:
        return None, None
    sub = ctx.sub_by_code.get((ref[0], ref[1])) if ref[1] else None
    if sub is not None and not sub.is_archived:
        return category.id, sub.id
    return category.id, None


def _month(d: date) -> tuple[int, int]:
    return d.year, d.month


# --- Passi della pipeline ---------------------------------------------------------------------


def _locked(tx: Transaction) -> bool:
    """Movimento inserito e classificato a mano: nessun passo automatico lo tocca."""
    return tx.is_manual and tx.classification_source == ClassificationSource.MANUAL


def _transfers(
    ctx: _Context,
    rule_of: dict[int, CompiledRule | None],
    locked: set[int],
) -> tuple[dict[int, tuple[int, str]], set[int], list[TransferMatch], set[int]]:
    """Coppie (id → (partner, motivo)), movimenti verso un tuo conto senza coppia, proposte,
    movimenti della banca che finanziano un pagamento PayPal."""
    # La controparte sei tu (es. "To Mario Rossi" su Revolut, PAYPAL*ROSSI MARIO): resta un
    # giroconto anche se una regola generica (es. i bonifici tra amici) direbbe altro.
    to_self = {
        tx.id
        for tx in ctx.transactions
        if is_owner(tx.counterparty_name, ctx.owners)
        or is_paypal_to_owner(tx.description_raw, ctx.owners)
    }
    excluded = set(locked)
    forced: dict[int, int] = {}
    for tx in ctx.transactions:
        ov = ctx.overrides.get(tx.id, {})
        if OverrideField.TRANSFER_PAIR_ID in ov:
            partner = _as_int(ov[OverrideField.TRANSFER_PAIR_ID])
            if partner is not None and partner in ctx.by_id and partner not in locked:
                forced[tx.id] = partner
            excluded.add(tx.id)
            continue
        kind_ov = ov.get(OverrideField.KIND)
        if OverrideField.KIND in ov and kind_ov != TransactionKind.INTERNAL_TRANSFER:
            excluded.add(tx.id)
            continue
        rule = rule_of.get(tx.id)
        if (
            rule
            and rule.actions.kind
            and rule.actions.kind != TransactionKind.INTERNAL_TRANSFER
            and tx.id not in to_self
        ):
            excluded.add(tx.id)

    pairs: dict[int, tuple[int, str]] = {}
    for a, b in forced.items():
        if forced.get(b) == a or b not in forced:
            pairs[a] = (b, _MANUAL_PAIR)
            pairs[b] = (a, _MANUAL_PAIR)

    paypal_pairs, funding, paypal_out = _paypal(ctx, excluded | set(pairs))
    for a, b in paypal_pairs.items():
        pairs[a] = (b, "prelievo da PayPal")
    excluded |= set(funding)

    candidates = [
        TransferCandidate(
            id=tx.id,
            account_id=tx.account_id,
            booking_date=tx.booking_date,
            amount_eur=tx.amount_eur,
            currency=tx.currency,
            text=_tx_text(tx),
            counterparty_iban=normalize_iban(tx.counterparty_iban),
            rule_says_transfer=bool(
                (r := rule_of.get(tx.id)) and r.actions.kind == TransactionKind.INTERNAL_TRANSFER
            ),
        )
        for tx in ctx.transactions
        if tx.id not in excluded and tx.id not in pairs and tx.amount_eur != 0
    ]
    suggestions: list[TransferMatch] = []
    for match in match_transfers(candidates, my_ibans=ctx.my_ibans, keywords=ctx.keywords):
        if match.reason is None:
            suggestions.append(match)
            continue
        pairs[match.out_id] = (match.in_id, match.reason)
        pairs[match.in_id] = (match.out_id, match.reason)

    to_own_account = {
        c.id
        for c in candidates
        if c.id not in pairs
        and (
            c.id in to_self
            or (
                c.counterparty_iban in ctx.my_ibans
                and c.counterparty_iban != normalize_iban(ctx.accounts[c.account_id].iban)
            )
        )
    }
    to_own_account |= paypal_out - set(pairs)
    return pairs, to_own_account, suggestions, set(funding)


_PAYPAL_WITHDRAWAL = frozenset({"MONEY_TRANSFER"})


def _paypal(ctx: _Context, excluded: set[int]) -> tuple[dict[int, int], dict[int, int], set[int]]:
    """Prelievi da PayPal e pagamenti PayPal finanziati da una carta (vedi `paypal.py`)."""
    paypal_accounts = {
        a.id for a in ctx.accounts.values() if contains_phrase(match_text(a.institution), "paypal")
    }
    if not paypal_accounts:
        return {}, {}, set()

    def withdrawal(tx: Transaction) -> bool:
        code = (tx.raw or {}).get("bank_transaction_code") if isinstance(tx.raw, dict) else None
        sub = str(code.get("sub_code") or "").upper() if isinstance(code, dict) else ""
        return tx.amount_eur < 0 and sub in _PAYPAL_WITHDRAWAL

    candidates = []
    for tx in ctx.transactions:
        if tx.id in excluded or tx.amount_eur == 0:
            continue
        on_paypal = tx.account_id in paypal_accounts
        mentions = not on_paypal and contains_phrase(_tx_text(tx), "paypal")
        if on_paypal or mentions:
            candidates.append(
                PaypalCandidate(
                    id=tx.id,
                    day=tx.booking_date,
                    amount_eur=tx.amount_eur,
                    on_paypal=on_paypal,
                    mentions_paypal=mentions,
                    withdrawal=on_paypal and withdrawal(tx),
                )
            )
    return link_paypal(candidates)


def _investment_links(
    ctx: _Context,
    rule_of: dict[int, CompiledRule | None],
    blocked: set[int],
) -> dict[int, int]:
    """Versamenti e prelievi del broker ↔ movimento bancario (id flusso → id movimento)."""
    if not ctx.cash_flows:
        return {}

    def has_clue(tx: Transaction) -> bool:
        rule = rule_of.get(tx.id)
        if rule and rule.actions.kind == TransactionKind.INVESTMENT_TRANSFER:
            return True
        text = _tx_text(tx)
        return any(contains_phrase(text, name) for name in ctx.broker_names)

    eligible = [
        tx
        for tx in ctx.transactions
        if tx.id not in blocked
        and ctx.accounts[tx.account_id].type != AccountType.BROKER
        and ctx.overrides.get(tx.id, {}).get(
            OverrideField.KIND, TransactionKind.INVESTMENT_TRANSFER
        )
        == TransactionKind.INVESTMENT_TRANSFER
        and tx.amount_eur != 0
        and has_clue(tx)
    ]
    scored: list[tuple[tuple[int, int, int], int, int]] = []
    for flow in ctx.cash_flows:
        flow_day = flow.occurred_at.date()
        deposit = flow.type == CashFlowType.DEPOSIT
        wanted = -flow.amount_eur if deposit else flow.amount_eur
        for tx in eligible:
            if tx.amount_eur != wanted:
                continue
            # Il bonifico parte prima (o lo stesso giorno) dell'accredito sul broker.
            first, second = (tx.booking_date, flow_day) if deposit else (flow_day, tx.booking_date)
            if second < first - timedelta(days=1):
                continue
            gap = business_days_between(first, second)
            if gap > MAX_BUSINESS_DAYS:
                continue
            scored.append(((gap, flow.id, tx.id), flow.id, tx.id))

    links: dict[int, int] = {}
    used_tx: set[int] = set()
    for _, flow_id, tx_id in sorted(scored):
        if flow_id in links or tx_id in used_tx:
            continue
        links[flow_id] = tx_id
        used_tx.add(tx_id)
    return links


def _apply_rule(ctx: _Context, decision: Decision, rule: CompiledRule) -> None:
    a = rule.actions
    if a.kind is not None:
        decision.kind = a.kind
        decision.kind_locked = True
    if a.merchant_id is not None and a.merchant_id in ctx.merchants:
        decision.merchant_id = a.merchant_id
    if a.category_id is not None or a.subcategory_id is not None:
        decision.category_id, decision.subcategory_id = _category_pair(
            ctx, a.category_id, a.subcategory_id
        )
    if a.income_type_id is not None and a.income_type_id in ctx.income_types:
        decision.income_type_id = a.income_type_id
    if a.tag_ids:
        decision.rule_tag_ids = frozenset(t for t in a.tag_ids if t in ctx.tag_ids)
    decision.source = ClassificationSource.RULE
    decision.rule_id = rule.id
    decision.note = f"Regola «{rule.name}»"


def _fallback_category(ctx: _Context, decision: Decision, tx: Transaction) -> None:
    """Passi 5 e 6: categoria predefinita del merchant, poi MCC / categoria del provider."""
    merchant = ctx.merchants.get(decision.merchant_id) if decision.merchant_id else None
    if merchant is not None and merchant.default_category_id is not None:
        cat, sub = _category_pair(
            ctx, merchant.default_category_id, merchant.default_subcategory_id
        )
        if cat is not None and not ctx.categories[cat].is_archived:
            decision.category_id, decision.subcategory_id = cat, sub
            if decision.source == ClassificationSource.NONE:
                decision.source = ClassificationSource.MERCHANT
                decision.note = f"Categoria predefinita di {merchant.name}"
            return

    for ref, note in (
        (category_for_mcc(tx.mcc), f"Codice MCC {tx.mcc}"),
        (
            category_for_provider(tx.provider_category),
            f"Categoria della banca «{tx.provider_category}»",
        ),
    ):
        if ref is None:
            continue
        cat, sub = _ref_to_ids(ctx, ref)
        if cat is not None:
            decision.category_id, decision.subcategory_id = cat, sub
            if decision.source == ClassificationSource.NONE:
                decision.source = ClassificationSource.PROVIDER
                decision.note = note
            return


def _decide(
    ctx: _Context,
    tx: Transaction,
    merchant_id: int | None,
    rule: CompiledRule | None,
    pair: tuple[int, str] | None,
    to_own_account: bool,
    investment: bool,
    funds_paypal: bool = False,
) -> Decision:
    d = Decision(kind=default_kind(tx.amount_eur), merchant_id=merchant_id)
    if pair is not None:
        d.kind, d.merchant_id, d.kind_locked = TransactionKind.INTERNAL_TRANSFER, None, True
        d.transfer_pair_id = pair[0]
        d.source = (
            ClassificationSource.MANUAL
            if pair[1] == _MANUAL_PAIR
            else ClassificationSource.HEURISTIC
        )
        d.note = f"Trasferimento tra i tuoi conti ({pair[1]})"
        return d
    if to_own_account:
        d.kind, d.merchant_id, d.kind_locked = TransactionKind.INTERNAL_TRANSFER, None, True
        d.source = ClassificationSource.HEURISTIC
        d.note = "La controparte sei tu o un tuo conto"
        return d
    if funds_paypal:
        d.kind, d.merchant_id, d.kind_locked = TransactionKind.INTERNAL_TRANSFER, None, True
        d.source = ClassificationSource.HEURISTIC
        d.note = "Pagato con PayPal: la spesa è contata sul conto PayPal"
        return d
    if investment:
        investimenti = ctx.category_by_code.get("investimenti")
        d.kind, d.kind_locked = TransactionKind.INVESTMENT_TRANSFER, True
        d.category_id = investimenti.id if investimenti else None
        d.source = ClassificationSource.HEURISTIC
        d.note = "Abbinato a un movimento del conto investimenti"
        if rule is not None and rule.actions.kind == TransactionKind.INVESTMENT_TRANSFER:
            _apply_rule(ctx, d, rule)
        return d
    if rule is not None and _yields_to_merchant(ctx, rule, d.merchant_id):
        rule = None
    if rule is not None:
        _apply_rule(ctx, d, rule)
    if d.category_id is None and d.kind in SPENDING_KINDS:
        _fallback_category(ctx, d, tx)
    if rule is None or rule.origin == RuleOrigin.SEED:
        _travel(ctx, d, tx)
    return d


def _yields_to_merchant(ctx: _Context, rule: CompiledRule, merchant_id: int | None) -> bool:
    """Una regola di sistema che dà solo la categoria (es. la parola "bar") cede alla
    categoria predefinita di un merchant noto: il merchant è più specifico."""
    a = rule.actions
    if rule.origin != RuleOrigin.SEED or a.kind is not None or a.income_type_id is not None:
        return False
    merchant = ctx.merchants.get(merchant_id) if merchant_id is not None else None
    return merchant is not None and merchant.default_category_id is not None


#: Spese che non dipendono da dove sei (o con la sede legale nella causale): restano loro
#: anche fuori casa. Tutto il resto pagato altrove finisce in Viaggi.
_NOT_PLACE_BOUND = frozenset(
    {
        "giochi",
        "abbonamenti",
        "investimenti",
        "casa",
        "istruzione",
        "sport",
        "regali",
        "spese_divise",
        "viaggi",
    }
)
_NOT_PLACE_BOUND_SUBS = frozenset(
    {("trasporti", "monopattini"), ("trasporti", "parcheggi"), ("trasporti", "treno")}
)
#: Merchant che vendono online o consegnano a casa: la città nella causale è la sede.
_ONLINE_MERCHANTS = frozenset(
    {"amazon", "deliveroo", "glovo", "just-eat", "trenitalia", "italo", "paypal", "booking"}
)


#: In viaggio la spesa va in Viaggi, nella sottocategoria che corrisponde a cosa era.
_TRAVEL_SUBS: dict[tuple[str | None, str | None], str] = {
    ("ristoranti", None): "cibo",
    ("spesa", None): "cibo",
    ("trasporti", "bus"): "bus_metro",
    ("trasporti", None): "bus_metro",
    ("trasporti", "treno"): "treni",
    ("uscite", None): "visite",
}
#: Due giorni di viaggio a questa distanza fanno parte dello stesso viaggio.
TRIP_GAP_DAYS = 2
_CARD_CODES = frozenset({"CARD_PAYMENT"})


def _codes(ctx: _Context, d: Decision) -> tuple[str | None, str | None]:
    category = ctx.categories.get(d.category_id) if d.category_id is not None else None
    sub = ctx.subcategories.get(d.subcategory_id) if d.subcategory_id is not None else None
    return (category.code if category else None), (sub.code if sub else None)


def _place_bound(ctx: _Context, d: Decision) -> bool:
    merchant = ctx.merchants.get(d.merchant_id) if d.merchant_id is not None else None
    if merchant is not None and merchant.normalized_key in _ONLINE_MERCHANTS:
        return False
    code, sub = _codes(ctx, d)
    return code not in _NOT_PLACE_BOUND and (code, sub) not in _NOT_PLACE_BOUND_SUBS


def _to_travel(ctx: _Context, d: Decision, note: str) -> bool:
    viaggi = ctx.category_by_code.get("viaggi")
    if viaggi is None or viaggi.is_archived:
        return False
    code, sub = _codes(ctx, d)
    sub_code = _TRAVEL_SUBS.get((code, sub)) or _TRAVEL_SUBS.get((code, None))
    travel_sub = ctx.sub_by_code.get(("viaggi", sub_code)) if sub_code else None
    d.category_id = viaggi.id
    d.subcategory_id = travel_sub.id if travel_sub and not travel_sub.is_archived else None
    d.source, d.rule_id = ClassificationSource.HEURISTIC, None
    d.note = note
    return True


def _travel(ctx: _Context, d: Decision, tx: Transaction) -> None:
    """Pagamento con carta fuori dai tuoi posti (`HOME_PLACES`) → Viaggi."""
    if not ctx.homes or d.kind != TransactionKind.EXPENSE:
        return
    location = card_location(tx.description_raw)
    if location is None or not is_away(location, ctx.homes) or not _place_bound(ctx, d):
        return
    d.away = _to_travel(ctx, d, f"Pagato fuori casa ({location.text})")


def _is_card_payment(tx: Transaction) -> bool:
    if (tx.provider_category or "").upper() in _CARD_CODES:
        return True
    code = (tx.raw or {}).get("bank_transaction_code") if isinstance(tx.raw, dict) else None
    return isinstance(code, dict) and str(code.get("code") or "").upper() in _CARD_CODES


def _trip_days(ctx: _Context, decisions: dict[int, Decision]) -> set[date]:
    """Giorni di viaggio: quelli con pagamenti fuori casa, più i giorni in mezzo se due
    pagamenti fuori casa sono vicini (lo stesso viaggio)."""
    days = sorted({ctx.by_id[i].booking_date for i, d in decisions.items() if d.away})
    trip: set[date] = set(days)
    for first, second in itertools.pairwise(days):
        if (second - first).days <= TRIP_GAP_DAYS:
            trip.update(first + timedelta(days=n) for n in range((second - first).days))
    return trip


def _travel_by_day(ctx: _Context, decisions: dict[int, Decision]) -> None:
    """Pagamenti con carta senza città nella causale (es. Revolut) fatti nei giorni in cui
    un'altra carta pagava fuori casa → anche loro Viaggi."""
    if not ctx.homes:
        return
    trip = _trip_days(ctx, decisions)
    if not trip:
        return
    user_rules = {r.id for r in ctx.rules if r.origin != RuleOrigin.SEED}
    for tx_id, d in decisions.items():
        tx = ctx.by_id[tx_id]
        if (
            d.away
            or d.kind != TransactionKind.EXPENSE
            or tx.booking_date not in trip
            or d.rule_id in user_rules
            or card_location(tx.description_raw) is not None
            or not _is_card_payment(tx)
            or not _place_bound(ctx, d)
        ):
            continue
        _to_travel(ctx, d, f"Pagato durante un viaggio ({tx.booking_date:%d/%m/%Y})")


def _needs_auto_merchant(tx: Transaction, d: Decision) -> bool:
    if d.merchant_id is not None:
        return False
    if d.kind == TransactionKind.EXPENSE:
        return True
    return d.kind == TransactionKind.INCOME and bool(
        tx.counterparty_name or _REFUND_RE.search(tx.description_raw)
    )


def _create_auto_merchants(session: Session, ctx: _Context, decisions: dict[int, Decision]) -> int:
    created = 0
    for tx in ctx.transactions:
        d = decisions.get(tx.id)
        if d is None or not _needs_auto_merchant(tx, d):
            continue
        if OverrideField.MERCHANT_ID in ctx.overrides.get(tx.id, {}):
            continue
        source_text = merchant_source_text(tx.description_raw, tx.counterparty_name)
        key = merchant_key(source_text)
        if not key:
            continue
        merchant_id = ctx.key_index.get(key)
        if merchant_id is None:
            merchant = Merchant(
                name=merchant_display_name(source_text) or key,
                normalized_key=key,
                origin=MerchantOrigin.AUTO,
            )
            session.add(merchant)
            session.flush()
            ctx.merchants[merchant.id] = merchant
            ctx.key_index[key] = merchant.id
            merchant_id = merchant.id
            created += 1
        d.merchant_id = merchant_id
    return created


def _link_refunds(ctx: _Context, decisions: dict[int, Decision], locked: set[int]) -> int:
    """Entrata dallo stesso merchant di una spesa recente → rimborso di quella spesa."""
    refund_type = ctx.income_by_code.get(IncomeType.REFUND)

    def final_kind(tx: Transaction) -> str:
        return tx.kind if tx.id in locked else decisions[tx.id].kind

    def final_merchant(tx: Transaction) -> int | None:
        return tx.merchant_id if tx.id in locked else decisions[tx.id].merchant_id

    expenses: dict[int, list[Transaction]] = defaultdict(list)
    for tx in ctx.transactions:
        if final_kind(tx) == TransactionKind.EXPENSE and (m := final_merchant(tx)) is not None:
            expenses[m].append(tx)

    used: set[int] = set()
    linked = 0
    for tx in ctx.transactions:
        d = decisions.get(tx.id)
        if d is None or d.kind != TransactionKind.INCOME or d.kind_locked:
            continue
        ov = ctx.overrides.get(tx.id, {})
        if OverrideField.KIND in ov:
            continue
        keyword = bool(_REFUND_RE.search(tx.description_raw))

        target: Transaction | None = None
        if OverrideField.REFUND_OF_ID in ov:
            forced = _as_int(ov[OverrideField.REFUND_OF_ID])
            target = ctx.by_id.get(forced) if forced is not None else None
        elif d.merchant_id is not None:
            window_start = tx.booking_date - timedelta(days=REFUND_WINDOW_DAYS)
            candidates = [
                e
                for e in expenses.get(d.merchant_id, [])
                if window_start <= e.booking_date <= tx.booking_date and e.id not in used
            ]
            exact = [e for e in candidates if -e.amount_eur == tx.amount_eur]
            partial = [e for e in candidates if -e.amount_eur >= tx.amount_eur]
            pool = exact or (partial if keyword else [])
            target = max(pool, key=lambda e: (e.booking_date, e.id)) if pool else None

        if target is not None:
            used.add(target.id)
            original = decisions.get(target.id)
            d.kind, d.kind_locked = TransactionKind.REFUND, True
            d.refund_of_id = target.id
            d.category_id = original.category_id if original else target.category_id
            d.subcategory_id = original.subcategory_id if original else target.subcategory_id
            d.income_type_id = None
            if d.source in (ClassificationSource.NONE, ClassificationSource.MERCHANT):
                d.source = ClassificationSource.HEURISTIC
            d.note = f"Rimborso dell'acquisto del {target.booking_date:%d/%m/%Y}"
            linked += 1
        elif keyword and d.income_type_id is None and refund_type is not None:
            d.income_type_id = refund_type.id
            if d.source == ClassificationSource.NONE:
                d.source = ClassificationSource.HEURISTIC
                d.note = "Rimborso (dalla descrizione)"
    return linked


def _income_types(ctx: _Context, decisions: dict[int, Decision]) -> None:
    """Tipologia delle entrate rimaste senza: stipendio ricorrente, bonifico, cashback, ..."""
    by_code = ctx.income_by_code

    def counterparty_key(tx: Transaction) -> str | None:
        return normalize_iban(tx.counterparty_iban) or (
            merchant_key(tx.counterparty_name) if tx.counterparty_name else None
        )

    incomes = [
        tx
        for tx in ctx.transactions
        if (d := decisions.get(tx.id)) is not None and d.kind == TransactionKind.INCOME
    ]

    # Stipendio: stesso ordinante in almeno 3 mesi diversi, importo stabile.
    salary_ids: set[int] = set()
    groups: dict[str, list[Transaction]] = defaultdict(list)
    for tx in incomes:
        if (key := counterparty_key(tx)) is not None:
            groups[key].append(tx)
    for members in groups.values():
        if len({_month(t.booking_date) for t in members}) < SALARY_MIN_MONTHS:
            continue
        median = Decimal(str(statistics.median(t.amount_eur for t in members)))
        stable = [t for t in members if abs(t.amount_eur - median) <= median * SALARY_TOLERANCE]
        if len({_month(t.booking_date) for t in stable}) >= SALARY_MIN_MONTHS:
            salary_ids.update(t.id for t in stable)

    for tx in incomes:
        d = decisions[tx.id]
        if d.income_type_id is not None:
            continue
        text = f"{tx.description_raw} {tx.counterparty_name or ''}"
        if tx.id in salary_ids:
            code, note = IncomeType.SALARY, "Entrata mensile ricorrente dallo stesso ordinante"
        elif (tx.provider_category or "").casefold() == "cashback":
            code, note = IncomeType.CASHBACK, "Categoria della banca «cashback»"
        elif _DIVIDEND_RE.search(text):
            code, note = IncomeType.DIVIDEND, "Dividendo (dalla descrizione)"
        elif tx.counterparty_name or _TRANSFER_IN_RE.search(text):
            code, note = IncomeType.TRANSFER_RECEIVED, "Bonifico ricevuto"
        else:
            code, note = IncomeType.OTHER, None
        income_type = by_code.get(code)
        if income_type is None:
            continue
        d.income_type_id = income_type.id
        if d.source == ClassificationSource.NONE and note is not None:
            d.source = ClassificationSource.HEURISTIC
            d.note = note


def _apply_overrides(ctx: _Context, tx: Transaction, d: Decision) -> None:
    ov = ctx.overrides.get(tx.id, {})
    touched = _CLASSIFICATION_OVERRIDES & ov.keys()
    if not touched:
        return
    if OverrideField.KIND in ov and ov[OverrideField.KIND] is not None:
        d.kind = ov[OverrideField.KIND] or d.kind
    if OverrideField.CATEGORY_ID in ov or OverrideField.SUBCATEGORY_ID in ov:
        if OverrideField.SUBCATEGORY_ID in ov:
            sub_id = _as_int(ov[OverrideField.SUBCATEGORY_ID])
        else:
            sub_id = d.subcategory_id
        if OverrideField.CATEGORY_ID in ov:
            cat_id = _as_int(ov[OverrideField.CATEGORY_ID])
            sub = ctx.subcategories.get(sub_id) if sub_id is not None else None
            if sub is None or sub.category_id != cat_id:
                sub_id = None
            d.category_id, d.subcategory_id = _category_pair(ctx, cat_id, sub_id)
        else:
            d.category_id, d.subcategory_id = _category_pair(ctx, d.category_id, sub_id)
            if sub_id is None:
                d.subcategory_id = None
    if OverrideField.INCOME_TYPE_ID in ov:
        value = _as_int(ov[OverrideField.INCOME_TYPE_ID])
        d.income_type_id = value if value in ctx.income_types else None
    if OverrideField.MERCHANT_ID in ov:
        value = _as_int(ov[OverrideField.MERCHANT_ID])
        d.merchant_id = value if value in ctx.merchants else None
    d.source = ClassificationSource.MANUAL
    d.rule_id = None
    d.note = "Correzione manuale"


# --- Esecuzione --------------------------------------------------------------------------------


def _compute(
    session: Session,
    ctx: _Context,
    *,
    create_merchants: bool,
    result: ClassificationResult,
    preview_rule: CompiledRule | None = None,
) -> tuple[dict[int, Decision], dict[int, int]]:
    locked = {tx.id for tx in ctx.transactions if _locked(tx)}

    merchant_of: dict[int, int | None] = {}
    for tx in ctx.transactions:
        ov = ctx.overrides.get(tx.id, {})
        if OverrideField.MERCHANT_ID in ov:
            merchant_of[tx.id] = _as_int(ov[OverrideField.MERCHANT_ID])
        else:
            merchant_of[tx.id] = _resolve_merchant(ctx, tx)

    rule_of: dict[int, CompiledRule | None] = {}
    for tx in ctx.transactions:
        if tx.id in locked:
            continue
        rule_of[tx.id] = first_match(ctx.rules, tx, merchant_of[tx.id])
        if preview_rule is not None and preview_rule.matches(tx, merchant_of[tx.id]):
            result.preview_matches.add(tx.id)

    pairs, to_own_account, suggestions, paypal_funding = _transfers(ctx, rule_of, locked)
    result.suggestions = suggestions
    links = _investment_links(ctx, rule_of, locked | set(pairs) | to_own_account | paypal_funding)
    investment_tx = set(links.values())

    decisions: dict[int, Decision] = {}
    for tx in ctx.transactions:
        if tx.id in locked:
            continue
        decisions[tx.id] = _decide(
            ctx,
            tx,
            merchant_of[tx.id],
            rule_of.get(tx.id),
            pairs.get(tx.id),
            tx.id in to_own_account,
            tx.id in investment_tx,
            tx.id in paypal_funding,
        )

    _travel_by_day(ctx, decisions)
    if create_merchants:
        result.merchants_created = _create_auto_merchants(session, ctx, decisions)
    result.refunds_linked = _link_refunds(ctx, decisions, locked)
    _income_types(ctx, decisions)
    for tx in ctx.transactions:
        if tx.id in decisions:
            _apply_overrides(ctx, tx, decisions[tx.id])

    result.transfer_pairs = len(pairs) // 2
    result.investment_links = len(links)
    result.locked_manual = len(locked)
    return decisions, links


_WRITTEN_FIELDS = (
    "kind",
    "merchant_id",
    "category_id",
    "subcategory_id",
    "income_type_id",
    "rule_id",
    "transfer_pair_id",
    "refund_of_id",
)


def _write(
    session: Session, ctx: _Context, decisions: dict[int, Decision], links: dict[int, int]
) -> int:
    changed = 0
    with session.no_autoflush:
        for tx in ctx.transactions:
            d = decisions.get(tx.id)
            if d is None:
                continue
            values = {f: getattr(d, f) for f in _WRITTEN_FIELDS}
            values["classification_source"] = d.source
            values["classification_note"] = d.note
            dirty = False
            for key, value in values.items():
                if getattr(tx, key) != value:
                    setattr(tx, key, value)
                    dirty = True
            changed += int(dirty)

        for flow in ctx.cash_flows:
            linked = links.get(flow.id)
            if flow.transaction_id != linked:
                flow.transaction_id = linked

    # Tag assegnati dalle regole: si ricalcolano; quelli messi a mano non si toccano.
    existing: dict[int, dict[int, str]] = defaultdict(dict)
    for row in session.scalars(select(TransactionTag)):
        existing[row.transaction_id][row.tag_id] = row.source
    for tx_id, d in decisions.items():
        current = existing.get(tx_id, {})
        for tag_id in d.rule_tag_ids - current.keys():
            session.add(TransactionTag(transaction_id=tx_id, tag_id=tag_id, source=TagSource.RULE))
        stale = {t for t, s in current.items() if s == TagSource.RULE} - d.rule_tag_ids
        for tag_id in stale:
            tag_row = session.get(TransactionTag, (tx_id, tag_id))
            if tag_row is not None:
                session.delete(tag_row)
    session.flush()
    return changed


def _update_rule_stats(session: Session, ctx: _Context) -> None:
    """`match_count` = movimenti classificati ora dalla regola; `last_matched_at` = data
    del più recente (serve a segnalare le regole che non trovano più nulla)."""
    counts: dict[int, int] = defaultdict(int)
    latest: dict[int, date] = {}
    for tx in ctx.transactions:
        if tx.rule_id is None:
            continue
        counts[tx.rule_id] += 1
        if tx.rule_id not in latest or tx.booking_date > latest[tx.rule_id]:
            latest[tx.rule_id] = tx.booking_date
    for rule in session.scalars(select(TransactionRule)):
        rule.match_count = counts.get(rule.id, 0)
        last = latest.get(rule.id)
        rule.last_matched_at = datetime.combine(last, time(0), tzinfo=UTC) if last else None
    session.flush()


def refresh_descriptions(session: Session) -> int:
    """Ricalcola `description_clean` (cambia quando migliorano le regole di pulizia)."""
    changed = 0
    for tx in session.scalars(select(Transaction)):
        clean = clean_description(tx.description_raw)
        if tx.description_clean != clean:
            tx.description_clean = clean
            changed += 1
    session.flush()
    return changed


def classify_all(session: Session, *, today: date | None = None) -> ClassificationResult:
    """Classifica tutti i movimenti e salva il risultato (commit a carico del chiamante).
    Alla fine aggiorna le ricorrenze, che dipendono da merchant e tipi appena calcolati."""
    refresh_descriptions(session)
    ctx = _load_context(session, None, None)
    result = ClassificationResult(total=len(ctx.transactions))
    decisions, links = _compute(session, ctx, create_merchants=True, result=result)
    result.changed = _write(session, ctx, decisions, links)
    _update_rule_stats(session, ctx)
    result.decisions = decisions
    result.by_source = _count_sources(ctx)
    result.recurring = refresh_recurring(session, today)
    return result


def simulate(
    session: Session,
    *,
    extra_rule: CompiledRule | None = None,
    replace_rule_id: int | None = None,
) -> tuple[ClassificationResult, dict[int, Transaction]]:
    """Calcola la classificazione senza salvare nulla (anteprima delle regole, proposte)."""
    ctx = _load_context(session, extra_rule, replace_rule_id)
    result = ClassificationResult(total=len(ctx.transactions))
    decisions, _ = _compute(
        session, ctx, create_merchants=False, result=result, preview_rule=extra_rule
    )
    result.decisions = decisions
    return result, ctx.by_id


def _count_sources(ctx: _Context) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for tx in ctx.transactions:
        counts[tx.classification_source] += 1
    return dict(counts)
