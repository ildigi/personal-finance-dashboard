"""Modelli SQLAlchemy. Importare da qui garantisce che tutte le tabelle siano registrate."""

from app.models.accounts import Account, AccountSource, Balance
from app.models.auth import AuthCredential, AuthSession
from app.models.categories import Category, IncomeClassification, Subcategory
from app.models.investments import (
    Dividend,
    InvestmentCashFlow,
    InvestmentOrder,
    Pie,
    PieInstrument,
    Portfolio,
    PortfolioCashSnapshot,
    Position,
)
from app.models.merchants import Merchant
from app.models.planning import Budget, RecurringTransaction, TransactionRule
from app.models.system import FxRate, NetWorthSnapshot, SyncLog
from app.models.transactions import ManualOverride, Tag, Transaction, TransactionTag

__all__ = [
    "Account",
    "AccountSource",
    "AuthCredential",
    "AuthSession",
    "Balance",
    "Budget",
    "Category",
    "Dividend",
    "FxRate",
    "IncomeClassification",
    "InvestmentCashFlow",
    "InvestmentOrder",
    "ManualOverride",
    "Merchant",
    "NetWorthSnapshot",
    "Pie",
    "PieInstrument",
    "Portfolio",
    "PortfolioCashSnapshot",
    "Position",
    "RecurringTransaction",
    "Subcategory",
    "SyncLog",
    "Tag",
    "Transaction",
    "TransactionRule",
    "TransactionTag",
]
