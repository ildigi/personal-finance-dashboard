"""Valori ammessi per le colonne enum (TEXT + CHECK nel database)."""

from enum import StrEnum


class Provider(StrEnum):
    ENABLEBANKING = "enablebanking"
    TRADING212 = "trading212"
    MOCK = "mock"
    MANUAL = "manual"


class SourceStatus(StrEnum):
    ACTIVE = "active"
    EXPIRED = "expired"
    ERROR = "error"
    DISABLED = "disabled"


class AccountType(StrEnum):
    CHECKING = "checking"
    SAVINGS = "savings"
    CARD = "card"
    CREDIT_CARD = "credit_card"
    BROKER = "broker"


class CategoryKind(StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"
    INVESTMENT = "investment"


class TransactionStatus(StrEnum):
    PENDING = "pending"
    BOOKED = "booked"


class TransactionKind(StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    INTERNAL_TRANSFER = "internal_transfer"
    INVESTMENT_TRANSFER = "investment_transfer"
    REFUND = "refund"
    FEE = "fee"
    OTHER = "other"


class ClassificationSource(StrEnum):
    MANUAL = "manual"
    RULE = "rule"
    MERCHANT = "merchant"
    PROVIDER = "provider"
    HEURISTIC = "heuristic"
    NONE = "none"


class MerchantOrigin(StrEnum):
    SEED = "seed"  # elenco iniziale (database/seeds/merchants.yaml)
    AUTO = "auto"  # creato dalla classificazione a partire dalla descrizione
    USER = "user"  # creato o modificato da te


class TagSource(StrEnum):
    MANUAL = "manual"
    RULE = "rule"


class RuleOrigin(StrEnum):
    SEED = "seed"
    USER = "user"
    LEARNED = "learned"


class BalanceType(StrEnum):
    BOOKED = "booked"
    AVAILABLE = "available"


class BudgetPeriod(StrEnum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class Direction(StrEnum):
    OUT = "out"
    IN = "in"


class Frequency(StrEnum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    CUSTOM = "custom"


class RecurringStatus(StrEnum):
    SUGGESTED = "suggested"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    ENDED = "ended"


class IncomeType(StrEnum):
    SALARY = "salary"
    TRANSFER_RECEIVED = "transfer_received"
    REFUND = "refund"
    CASHBACK = "cashback"
    INTEREST = "interest"
    DIVIDEND = "dividend"
    CASH = "cash"
    FAMILY = "family"
    OTHER = "other"


class OrderSide(StrEnum):
    BUY = "buy"
    SELL = "sell"


class CashFlowType(StrEnum):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    # Non sono versamenti: fanno parte del rendimento (interessi) o dei costi (commissioni).
    INTEREST = "interest"
    FEE = "fee"


class SyncJob(StrEnum):
    ACCOUNTS = "accounts"
    BALANCES = "balances"
    TRANSACTIONS = "transactions"
    PORTFOLIO = "portfolio"
    ORDERS = "orders"
    DIVIDENDS = "dividends"
    CASH_FLOWS = "cash_flows"
    PIES = "pies"
    FX_RATES = "fx_rates"
    CLASSIFICATION = "classification"


class SyncStatus(StrEnum):
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL = "partial"
    ERROR = "error"


class OverrideField(StrEnum):
    """Campi di un movimento che una correzione manuale può fissare."""

    CATEGORY_ID = "category_id"
    SUBCATEGORY_ID = "subcategory_id"
    KIND = "kind"
    INCOME_TYPE_ID = "income_type_id"
    MERCHANT_ID = "merchant_id"
    NOTES = "notes"
    # Collegamenti: un valore abbina a mano, NULL vieta l'abbinamento automatico.
    TRANSFER_PAIR_ID = "transfer_pair_id"
    REFUND_OF_ID = "refund_of_id"
