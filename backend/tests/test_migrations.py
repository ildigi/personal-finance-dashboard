"""Migrazioni: upgrade su DB vuoto, rollback completo, nessuna differenza dai modelli."""

from __future__ import annotations

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect

import app.models  # noqa: F401
from app.db.base import Base
from tests.conftest import alembic_config

EXPECTED_TABLES = set(Base.metadata.tables)


def _tables(engine: Engine) -> set[str]:
    return set(inspect(engine).get_table_names()) - {"alembic_version"}


def test_all_spec_tables_are_modelled() -> None:
    assert {
        "account_sources", "accounts", "merchants", "categories", "subcategories",
        "transactions", "tags", "transaction_tags", "transaction_rules", "manual_overrides",
        "balances", "budgets", "recurring_transactions", "income_classifications",
        "portfolios", "positions", "portfolio_cash_snapshots", "investment_orders",
        "investment_cash_flows", "dividends", "sync_logs", "net_worth_snapshots", "fx_rates",
        "pies", "pie_instruments", "auth_credentials", "auth_sessions",
    } == EXPECTED_TABLES  # fmt: skip


def test_upgrade_downgrade_upgrade(engine: Engine) -> None:
    cfg = alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "base")
    assert _tables(engine) == set()

    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
    assert _tables(engine) == EXPECTED_TABLES


def test_models_match_migrations(engine: Engine) -> None:
    with engine.connect() as conn:
        ctx = MigrationContext.configure(
            conn, opts={"compare_type": True, "compare_server_default": True}
        )
        diff = compare_metadata(ctx, Base.metadata)
    assert diff == []
