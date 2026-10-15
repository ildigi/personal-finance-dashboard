"""Connettore Enable Banking: traduce l'API nelle strutture comuni. SOLO LETTURA.

Scelte di traduzione:
- **conti**: dalla sessione (salvata cifrata al momento del consenso). L'identificativo
  stabile è `identification_hash` (uguale tra sessioni diverse), poi l'IBAN, poi l'`uid`
  della sessione: così rinnovare il consenso non duplica i conti;
- **saldi**: contabile da `CLBD` (o `ITBD`, `XPCD`, …), disponibile da `ITAV` (o `CLAV`, …);
- **movimenti**: l'importo arriva sempre positivo e il verso è `credit_debit_indicator`
  (`DBIT` = uscita, negativo). `PDNG` = in sospeso, `BOOK` = contabilizzato. La controparte
  è il beneficiario per le uscite e l'ordinante per le entrate.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.integrations.base import AccountKind, ProviderAccount, ProviderBalance, ProviderTransaction
from app.integrations.enablebanking.client import EnableBankingClient, EnableBankingError
from app.services.dates import ROME

_ACCOUNT_TYPES: dict[str, AccountKind] = {
    "CACC": "checking",
    "TRAN": "checking",
    "SVGS": "savings",
    "CARD": "credit_card",
}
BOOKED_TYPES = ("CLBD", "ITBD", "XPCD", "OPBD", "PRCD", "INFO", "OTHR", "VALU")
AVAILABLE_TYPES = ("ITAV", "CLAV", "OPAV", "FWAV")


def _amount(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise EnableBankingError("Importo non valido nella risposta della banca") from None


def _date(value: Any) -> date | None:
    return date.fromisoformat(str(value)[:10]) if value else None


def _readable(text: Any) -> str | None:
    value = str(text or "").strip()
    return None if not value or ("_" in value and value.upper() == value) else value


#: Descrizione dei movimenti senza causale né controparte, dal codice dell'operazione.
_CODE_LABELS = {"MONEY_TRANSFER": "Trasferimento di denaro"}


def session_account(account: dict[str, Any]) -> dict[str, Any]:
    """Dal conto restituito da `POST /sessions` ai soli dati che servono (salvati cifrati)."""
    identification = account.get("account_id") or {}
    iban = identification.get("iban")
    external_id = account.get("identification_hash") or iban or account["uid"]
    return {
        "uid": account["uid"],
        "external_id": str(external_id),
        # `name` è l'intestatario, non il conto: si usa il prodotto (se è un nome leggibile,
        # non un codice come "PAYPAL_PREMIER_ACCOUNT").
        "name": _readable(account.get("product")) or _readable(account.get("details")),
        "currency": account.get("currency") or "EUR",
        "cash_account_type": account.get("cash_account_type"),
        "iban": iban,
    }


def _fallback_name(institution: str, iban: str | None) -> str:
    return f"Conto {institution} ··{iban[-4:]}" if iban else f"Conto {institution}"


class EnableBankingConnector:
    """Implementa `BankConnector` per una sessione (= un consenso presso una banca)."""

    def __init__(self, client: EnableBankingClient, session_data: dict[str, Any]) -> None:
        self.client = client
        self.institution = str((session_data.get("aspsp") or {}).get("name") or "Banca")
        self._accounts = [dict(a) for a in session_data.get("accounts") or []]
        self._uid = {a["external_id"]: a["uid"] for a in self._accounts}

    def close(self) -> None:
        self.client.close()

    def _uid_of(self, external_id: str) -> str:
        try:
            return str(self._uid[external_id])
        except KeyError:
            raise EnableBankingError("Conto non presente nel consenso attuale") from None

    def list_accounts(self) -> list[ProviderAccount]:
        return [
            ProviderAccount(
                external_id=a["external_id"],
                name=a.get("name") or _fallback_name(self.institution, a.get("iban")),
                type=_ACCOUNT_TYPES.get(str(a.get("cash_account_type") or ""), "checking"),
                currency=a.get("currency") or "EUR",
                institution=self.institution,
                iban=a.get("iban"),
            )
            for a in self._accounts
        ]

    def get_balances(self, account_external_id: str) -> list[ProviderBalance]:
        raw = self.client.balances(self._uid_of(account_external_id))
        types = {str(b.get("balance_type")) for b in raw}
        result = []
        for kind, preferred in (("booked", BOOKED_TYPES), ("available", AVAILABLE_TYPES)):
            chosen_type = next((t for t in preferred if t in types), None)
            if chosen_type is None:
                continue
            # Conti multivaluta (PayPal: un saldo per valuta): uno per valuta, li somma
            # la sincronizzazione convertendoli nella valuta del conto.
            by_currency = {}
            for b in raw:
                if str(b.get("balance_type")) == chosen_type:
                    by_currency[str((b.get("balance_amount") or {}).get("currency") or "EUR")] = b
            for currency, chosen in by_currency.items():
                amount = chosen.get("balance_amount") or {}
                result.append(
                    ProviderBalance(
                        account_external_id=account_external_id,
                        as_of=_date(chosen.get("reference_date"))
                        or _date(chosen.get("last_change_date_time"))
                        or datetime.now(ROME).date(),
                        amount=_amount(amount.get("amount")),
                        currency=currency,
                        balance_type=kind,  # type: ignore[arg-type]
                    )
                )
        return result

    def get_transactions(self, account_external_id: str, since: date) -> list[ProviderTransaction]:
        uid = self._uid_of(account_external_id)
        return [
            tx
            for t in self.client.transactions(uid, since.isoformat())
            if (tx := self._transaction(account_external_id, t)) is not None
        ]

    @staticmethod
    def _transaction(account_external_id: str, t: dict[str, Any]) -> ProviderTransaction | None:
        status = str(t.get("status") or "BOOK")
        if status not in ("BOOK", "PDNG"):
            return None  # annullati o altri stati
        money = t.get("transaction_amount") or {}
        amount = abs(_amount(money.get("amount")))
        outgoing = t.get("credit_debit_indicator") == "DBIT"
        day = (
            _date(t.get("booking_date"))
            or _date(t.get("transaction_date"))
            or _date(t.get("value_date"))
        )
        if day is None:
            return None
        party = (t.get("creditor") if outgoing else t.get("debtor")) or {}
        party_account = (t.get("creditor_account") if outgoing else t.get("debtor_account")) or {}
        remittance = " ".join(str(r) for r in t.get("remittance_information") or [] if r)
        code = t.get("bank_transaction_code") or {}
        description = (
            remittance.strip()
            or str(party.get("name") or "").strip()
            or str(code.get("description") or "").strip()
            or _CODE_LABELS.get(str(code.get("sub_code") or "").upper(), "")
            or "Movimento"
        )
        original_amount = original_currency = None
        exchange = t.get("exchange_rate") or {}
        instructed = exchange.get("instructed_amount") or {}
        if instructed.get("currency") and instructed.get("currency") != money.get("currency"):
            original_amount = abs(_amount(instructed.get("amount")))
            original_currency = str(instructed["currency"])
            if outgoing:
                original_amount = -original_amount
        external = t.get("entry_reference") or t.get("transaction_id")
        return ProviderTransaction(
            account_external_id=account_external_id,
            external_id=str(external) if external else None,
            booking_date=day,
            status="pending" if status == "PDNG" else "booked",
            amount=-amount if outgoing else amount,
            currency=str(money.get("currency") or "EUR"),
            description=description,
            value_date=_date(t.get("value_date")),
            original_amount=original_amount,
            original_currency=original_currency,
            counterparty_name=party.get("name"),
            counterparty_iban=party_account.get("iban"),
            provider_category=code.get("description") or None,
            mcc=t.get("merchant_category_code"),
            raw=t,
        )
