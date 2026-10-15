"""schema iniziale

Revision ID: b9b2e18150b5
Revises:
Create Date: 2026-10-04 21:54:30.001262+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b9b2e18150b5"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "account_sources",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("institution", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("consent_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credentials_ref", sa.Text(), nullable=True),
        sa.Column("session_data_encrypted", sa.LargeBinary(), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "provider IN ('enablebanking', 'trading212', 'mock', 'manual')",
            name=op.f("ck_account_sources_provider_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'expired', 'error', 'disabled')",
            name=op.f("ck_account_sources_status_valid"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_account_sources")),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("code", sa.Text(), nullable=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("icon", sa.Text(), nullable=True),
        sa.Column("color", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "excluded_from_spending", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("is_archived", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('expense', 'income', 'transfer', 'investment')",
            name=op.f("ck_categories_kind_valid"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.UniqueConstraint("code", name=op.f("uq_categories_code")),
        sa.UniqueConstraint("name", name=op.f("uq_categories_name")),
    )
    op.create_table(
        "fx_rates",
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("rate_to_eur", sa.Numeric(precision=20, scale=10), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name=op.f("ck_fx_rates_currency_iso4217")),
        sa.PrimaryKeyConstraint("date", "currency", name=op.f("pk_fx_rates")),
    )
    op.create_table(
        "income_classifications",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_income_classifications")),
        sa.UniqueConstraint("code", name=op.f("uq_income_classifications_code")),
    )
    op.create_table(
        "net_worth_snapshots",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("cash_total_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("investments_total_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("net_worth_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_net_worth_snapshots")),
        sa.UniqueConstraint("snapshot_date", name=op.f("uq_net_worth_snapshots_snapshot_date")),
    )
    op.create_table(
        "tags",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("color", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tags")),
        sa.UniqueConstraint("name", name=op.f("uq_tags_name")),
    )
    op.create_table(
        "transaction_rules",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("priority", sa.Integer(), server_default=sa.text("100"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("origin", sa.Text(), nullable=False),
        sa.Column("conditions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("actions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("match_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_matched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "jsonb_typeof(actions) = 'object'", name=op.f("ck_transaction_rules_actions_is_object")
        ),
        sa.CheckConstraint(
            "jsonb_typeof(conditions) = 'object'",
            name=op.f("ck_transaction_rules_conditions_is_object"),
        ),
        sa.CheckConstraint(
            "origin IN ('seed', 'user', 'learned')", name=op.f("ck_transaction_rules_origin_valid")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transaction_rules")),
    )
    op.create_index(
        op.f("ix_transaction_rules_priority"), "transaction_rules", ["priority"], unique=False
    )
    op.create_table(
        "accounts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("source_id", sa.BigInteger(), nullable=False),
        sa.Column("external_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("iban", sa.Text(), nullable=True),
        sa.Column("institution", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "include_in_net_worth", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("color", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name=op.f("ck_accounts_currency_iso4217")),
        sa.CheckConstraint(
            "type IN ('checking', 'savings', 'card', 'credit_card', 'broker')",
            name=op.f("ck_accounts_type_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["account_sources.id"],
            name=op.f("fk_accounts_source_id_account_sources"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_accounts")),
        sa.UniqueConstraint(
            "source_id", "external_id", name=op.f("uq_accounts_source_id_external_id")
        ),
    )
    op.create_table(
        "subcategories",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("category_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("code", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_subcategories_category_id_categories"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_subcategories")),
        sa.UniqueConstraint("category_id", "code", name=op.f("uq_subcategories_category_id_code")),
        sa.UniqueConstraint("category_id", "name", name=op.f("uq_subcategories_category_id_name")),
        sa.UniqueConstraint("id", "category_id", name=op.f("uq_subcategories_id_category_id")),
    )
    op.create_table(
        "sync_logs",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("source_id", sa.BigInteger(), nullable=False),
        sa.Column("job", sa.Text(), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("items_fetched", sa.Integer(), nullable=True),
        sa.Column("items_created", sa.Integer(), nullable=True),
        sa.Column("items_updated", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "job IN ('accounts', 'balances', 'transactions', 'portfolio', 'orders', 'dividends', 'cash_flows', 'fx_rates')",
            name=op.f("ck_sync_logs_job_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('running', 'success', 'partial', 'error')",
            name=op.f("ck_sync_logs_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["source_id"],
            ["account_sources.id"],
            name=op.f("fk_sync_logs_source_id_account_sources"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sync_logs")),
    )
    op.create_index(op.f("ix_sync_logs_source_id"), "sync_logs", ["source_id"], unique=False)
    op.create_table(
        "balances",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("account_id", sa.BigInteger(), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("balance", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("balance_type", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "balance_type IN ('booked', 'available')", name=op.f("ck_balances_balance_type_valid")
        ),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name=op.f("ck_balances_currency_iso4217")),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name=op.f("fk_balances_account_id_accounts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_balances")),
        sa.UniqueConstraint(
            "account_id",
            "as_of",
            "balance_type",
            name=op.f("uq_balances_account_id_as_of_balance_type"),
        ),
    )
    op.create_table(
        "budgets",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("category_id", sa.BigInteger(), nullable=False),
        sa.Column("subcategory_id", sa.BigInteger(), nullable=True),
        sa.Column("period", sa.Text(), server_default="monthly", nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column(
            "alert_threshold_pct", sa.Integer(), server_default=sa.text("80"), nullable=False
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("period IN ('monthly', 'yearly')", name=op.f("ck_budgets_period_valid")),
        sa.CheckConstraint(
            "alert_threshold_pct BETWEEN 1 AND 100",
            name=op.f("ck_budgets_alert_threshold_pct_range"),
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_budgets_amount_positive")),
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to >= valid_from", name=op.f("ck_budgets_valid_range")
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_budgets_category_id_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["subcategory_id", "category_id"],
            ["subcategories.id", "subcategories.category_id"],
            name="fk_budgets_subcategory_in_category",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_budgets")),
    )
    op.create_table(
        "merchants",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("normalized_key", sa.Text(), nullable=False),
        sa.Column(
            "aliases",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("'{}'::text[]"),
            nullable=False,
        ),
        sa.Column("default_category_id", sa.BigInteger(), nullable=True),
        sa.Column("default_subcategory_id", sa.BigInteger(), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["default_category_id"],
            ["categories.id"],
            name=op.f("fk_merchants_default_category_id_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["default_subcategory_id", "default_category_id"],
            ["subcategories.id", "subcategories.category_id"],
            name="fk_merchants_default_subcategory_in_category",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_merchants")),
        sa.UniqueConstraint("normalized_key", name=op.f("uq_merchants_normalized_key")),
    )
    op.create_table(
        "portfolios",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("account_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("base_currency", sa.CHAR(length=3), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "base_currency ~ '^[A-Z]{3}$'", name=op.f("ck_portfolios_base_currency_iso4217")
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name=op.f("fk_portfolios_account_id_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_portfolios")),
        sa.UniqueConstraint("account_id", name=op.f("uq_portfolios_account_id")),
    )
    op.create_table(
        "dividends",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("portfolio_id", sa.BigInteger(), nullable=False),
        sa.Column("external_id", sa.Text(), nullable=False),
        sa.Column("ticker", sa.Text(), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=20, scale=8), nullable=True),
        sa.Column("gross_per_share", sa.Numeric(precision=20, scale=8), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("amount_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("withholding_tax", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name=op.f("ck_dividends_currency_iso4217")),
        sa.ForeignKeyConstraint(
            ["portfolio_id"],
            ["portfolios.id"],
            name=op.f("fk_dividends_portfolio_id_portfolios"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dividends")),
        sa.UniqueConstraint("external_id", name=op.f("uq_dividends_external_id")),
    )
    op.create_index(op.f("ix_dividends_paid_on"), "dividends", ["paid_on"], unique=False)
    op.create_table(
        "investment_orders",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("portfolio_id", sa.BigInteger(), nullable=False),
        sa.Column("external_id", sa.Text(), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ticker", sa.Text(), nullable=False),
        sa.Column("isin", sa.Text(), nullable=True),
        sa.Column("side", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("fill_price", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("instrument_currency", sa.CHAR(length=3), nullable=False),
        sa.Column("fx_rate", sa.Numeric(precision=20, scale=10), nullable=True),
        sa.Column("value_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("fees_eur", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("taxes_eur", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "instrument_currency ~ '^[A-Z]{3}$'",
            name=op.f("ck_investment_orders_instrument_currency_iso4217"),
        ),
        sa.CheckConstraint("side IN ('buy', 'sell')", name=op.f("ck_investment_orders_side_valid")),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_investment_orders_quantity_positive")),
        sa.ForeignKeyConstraint(
            ["portfolio_id"],
            ["portfolios.id"],
            name=op.f("fk_investment_orders_portfolio_id_portfolios"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_investment_orders")),
        sa.UniqueConstraint(
            "portfolio_id",
            "external_id",
            name=op.f("uq_investment_orders_portfolio_id_external_id"),
        ),
    )
    op.create_index(
        op.f("ix_investment_orders_executed_at"), "investment_orders", ["executed_at"], unique=False
    )
    op.create_table(
        "portfolio_cash_snapshots",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("portfolio_id", sa.BigInteger(), nullable=False),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("free", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("invested", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("unrealized_pl", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("ck_portfolio_cash_snapshots_currency_iso4217")
        ),
        sa.ForeignKeyConstraint(
            ["portfolio_id"],
            ["portfolios.id"],
            name=op.f("fk_portfolio_cash_snapshots_portfolio_id_portfolios"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_portfolio_cash_snapshots")),
        sa.UniqueConstraint(
            "portfolio_id",
            "snapshot_at",
            name=op.f("uq_portfolio_cash_snapshots_portfolio_id_snapshot_at"),
        ),
    )
    op.create_table(
        "positions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("portfolio_id", sa.BigInteger(), nullable=False),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ticker", sa.Text(), nullable=False),
        sa.Column("isin", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("avg_price", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("current_price", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("instrument_currency", sa.CHAR(length=3), nullable=False),
        sa.Column("fx_rate", sa.Numeric(precision=20, scale=10), nullable=True),
        sa.Column("cost_basis_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("market_value_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("unrealized_pl_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "instrument_currency ~ '^[A-Z]{3}$'",
            name=op.f("ck_positions_instrument_currency_iso4217"),
        ),
        sa.CheckConstraint("quantity >= 0", name=op.f("ck_positions_quantity_non_negative")),
        sa.ForeignKeyConstraint(
            ["portfolio_id"],
            ["portfolios.id"],
            name=op.f("fk_positions_portfolio_id_portfolios"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_positions")),
        sa.UniqueConstraint(
            "portfolio_id",
            "snapshot_at",
            "ticker",
            name=op.f("uq_positions_portfolio_id_snapshot_at_ticker"),
        ),
    )
    op.create_table(
        "recurring_transactions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("direction", sa.Text(), nullable=False),
        sa.Column("merchant_id", sa.BigInteger(), nullable=True),
        sa.Column("category_id", sa.BigInteger(), nullable=True),
        sa.Column("subcategory_id", sa.BigInteger(), nullable=True),
        sa.Column("frequency", sa.Text(), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=True),
        sa.Column("expected_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "amount_tolerance_pct",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("10"),
            nullable=False,
        ),
        sa.Column("next_expected_date", sa.Date(), nullable=True),
        sa.Column("status", sa.Text(), server_default="suggested", nullable=False),
        sa.Column("confidence", sa.Numeric(precision=4, scale=3), nullable=True),
        sa.Column("last_seen_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "direction IN ('out', 'in')", name=op.f("ck_recurring_transactions_direction_valid")
        ),
        sa.CheckConstraint(
            "frequency <> 'custom' OR interval_days IS NOT NULL",
            name=op.f("ck_recurring_transactions_custom_needs_interval"),
        ),
        sa.CheckConstraint(
            "frequency IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')",
            name=op.f("ck_recurring_transactions_frequency_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('suggested', 'confirmed', 'rejected', 'ended')",
            name=op.f("ck_recurring_transactions_status_valid"),
        ),
        sa.CheckConstraint(
            "amount_tolerance_pct >= 0",
            name=op.f("ck_recurring_transactions_tolerance_non_negative"),
        ),
        sa.CheckConstraint(
            "confidence IS NULL OR confidence BETWEEN 0 AND 1",
            name=op.f("ck_recurring_transactions_confidence_range"),
        ),
        sa.CheckConstraint(
            "interval_days IS NULL OR interval_days > 0",
            name=op.f("ck_recurring_transactions_interval_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_recurring_transactions_category_id_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["merchant_id"],
            ["merchants.id"],
            name=op.f("fk_recurring_transactions_merchant_id_merchants"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["subcategory_id", "category_id"],
            ["subcategories.id", "subcategories.category_id"],
            name="fk_recurring_transactions_subcategory_in_category",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recurring_transactions")),
    )
    op.create_table(
        "transactions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("account_id", sa.BigInteger(), nullable=False),
        sa.Column("external_id", sa.Text(), nullable=True),
        sa.Column("dedupe_hash", sa.Text(), nullable=False),
        sa.Column("booking_date", sa.Date(), nullable=False),
        sa.Column("value_date", sa.Date(), nullable=True),
        sa.Column("status", sa.Text(), server_default="booked", nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("amount_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("original_amount", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("original_currency", sa.CHAR(length=3), nullable=True),
        sa.Column("fx_rate", sa.Numeric(precision=20, scale=10), nullable=True),
        sa.Column("description_raw", sa.Text(), nullable=False),
        sa.Column("description_clean", sa.Text(), nullable=False),
        sa.Column("counterparty_name", sa.Text(), nullable=True),
        sa.Column("counterparty_iban", sa.Text(), nullable=True),
        sa.Column("provider_category", sa.Text(), nullable=True),
        sa.Column("mcc", sa.Text(), nullable=True),
        sa.Column("merchant_id", sa.BigInteger(), nullable=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("category_id", sa.BigInteger(), nullable=True),
        sa.Column("subcategory_id", sa.BigInteger(), nullable=True),
        sa.Column("income_type_id", sa.BigInteger(), nullable=True),
        sa.Column("classification_source", sa.Text(), server_default="none", nullable=False),
        sa.Column("rule_id", sa.BigInteger(), nullable=True),
        sa.Column("transfer_pair_id", sa.BigInteger(), nullable=True),
        sa.Column("recurring_id", sa.BigInteger(), nullable=True),
        sa.Column("refund_of_id", sa.BigInteger(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_manual", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "classification_source IN ('manual', 'rule', 'merchant', 'provider', 'heuristic', 'none')",
            name=op.f("ck_transactions_classification_source_valid"),
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("ck_transactions_currency_iso4217")
        ),
        sa.CheckConstraint(
            "kind IN ('expense', 'income', 'internal_transfer', 'investment_transfer', 'refund', 'fee', 'other')",
            name=op.f("ck_transactions_kind_valid"),
        ),
        sa.CheckConstraint(
            "original_currency ~ '^[A-Z]{3}$'",
            name=op.f("ck_transactions_original_currency_iso4217"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'booked')", name=op.f("ck_transactions_status_valid")
        ),
        sa.CheckConstraint("refund_of_id <> id", name=op.f("ck_transactions_refund_of_not_self")),
        sa.CheckConstraint(
            "transfer_pair_id <> id", name=op.f("ck_transactions_transfer_pair_not_self")
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name=op.f("fk_transactions_account_id_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_transactions_category_id_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["income_type_id"],
            ["income_classifications.id"],
            name=op.f("fk_transactions_income_type_id_income_classifications"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["merchant_id"],
            ["merchants.id"],
            name=op.f("fk_transactions_merchant_id_merchants"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["recurring_id"],
            ["recurring_transactions.id"],
            name=op.f("fk_transactions_recurring_id_recurring_transactions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["refund_of_id"],
            ["transactions.id"],
            name=op.f("fk_transactions_refund_of_id_transactions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["rule_id"],
            ["transaction_rules.id"],
            name=op.f("fk_transactions_rule_id_transaction_rules"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["subcategory_id", "category_id"],
            ["subcategories.id", "subcategories.category_id"],
            name="fk_transactions_subcategory_in_category",
        ),
        sa.ForeignKeyConstraint(
            ["transfer_pair_id"],
            ["transactions.id"],
            name=op.f("fk_transactions_transfer_pair_id_transactions"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transactions")),
        sa.UniqueConstraint(
            "account_id", "external_id", name=op.f("uq_transactions_account_id_external_id")
        ),
    )
    op.create_index(
        "ix_transactions_account_id_booking_date",
        "transactions",
        ["account_id", "booking_date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_transactions_booking_date"), "transactions", ["booking_date"], unique=False
    )
    op.create_index(
        op.f("ix_transactions_category_id"), "transactions", ["category_id"], unique=False
    )
    op.create_index(
        op.f("ix_transactions_dedupe_hash"), "transactions", ["dedupe_hash"], unique=False
    )
    op.create_index(
        "ix_transactions_description_fts",
        "transactions",
        [sa.literal_column("to_tsvector('simple'::regconfig, description_clean)")],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(op.f("ix_transactions_kind"), "transactions", ["kind"], unique=False)
    op.create_index(
        op.f("ix_transactions_merchant_id"), "transactions", ["merchant_id"], unique=False
    )
    op.create_table(
        "investment_cash_flows",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("portfolio_id", sa.BigInteger(), nullable=False),
        sa.Column("external_id", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.CHAR(length=3), nullable=False),
        sa.Column("amount_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("transaction_id", sa.BigInteger(), nullable=True),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("ck_investment_cash_flows_currency_iso4217")
        ),
        sa.CheckConstraint(
            "type IN ('deposit', 'withdrawal')", name=op.f("ck_investment_cash_flows_type_valid")
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_investment_cash_flows_amount_positive")),
        sa.ForeignKeyConstraint(
            ["portfolio_id"],
            ["portfolios.id"],
            name=op.f("fk_investment_cash_flows_portfolio_id_portfolios"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["transaction_id"],
            ["transactions.id"],
            name=op.f("fk_investment_cash_flows_transaction_id_transactions"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_investment_cash_flows")),
        sa.UniqueConstraint(
            "portfolio_id",
            "external_id",
            name=op.f("uq_investment_cash_flows_portfolio_id_external_id"),
        ),
    )
    op.create_index(
        op.f("ix_investment_cash_flows_occurred_at"),
        "investment_cash_flows",
        ["occurred_at"],
        unique=False,
    )
    op.create_table(
        "manual_overrides",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("transaction_id", sa.BigInteger(), nullable=False),
        sa.Column("field", sa.Text(), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "field IN ('category_id', 'subcategory_id', 'kind', 'income_type_id', 'merchant_id', 'notes')",
            name=op.f("ck_manual_overrides_field_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["transaction_id"],
            ["transactions.id"],
            name=op.f("fk_manual_overrides_transaction_id_transactions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_manual_overrides")),
        sa.UniqueConstraint(
            "transaction_id", "field", name=op.f("uq_manual_overrides_transaction_id_field")
        ),
    )
    op.create_table(
        "transaction_tags",
        sa.Column("transaction_id", sa.BigInteger(), nullable=False),
        sa.Column("tag_id", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.Text(), server_default="manual", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source IN ('manual', 'rule')", name=op.f("ck_transaction_tags_source_valid")
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"],
            ["tags.id"],
            name=op.f("fk_transaction_tags_tag_id_tags"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["transaction_id"],
            ["transactions.id"],
            name=op.f("fk_transaction_tags_transaction_id_transactions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("transaction_id", "tag_id", name=op.f("pk_transaction_tags")),
    )
    op.create_index(
        op.f("ix_transaction_tags_tag_id"), "transaction_tags", ["tag_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_transaction_tags_tag_id"), table_name="transaction_tags")
    op.drop_table("transaction_tags")
    op.drop_table("manual_overrides")
    op.drop_index(op.f("ix_investment_cash_flows_occurred_at"), table_name="investment_cash_flows")
    op.drop_table("investment_cash_flows")
    op.drop_index(op.f("ix_transactions_merchant_id"), table_name="transactions")
    op.drop_index(op.f("ix_transactions_kind"), table_name="transactions")
    op.drop_index(
        "ix_transactions_description_fts", table_name="transactions", postgresql_using="gin"
    )
    op.drop_index(op.f("ix_transactions_dedupe_hash"), table_name="transactions")
    op.drop_index(op.f("ix_transactions_category_id"), table_name="transactions")
    op.drop_index(op.f("ix_transactions_booking_date"), table_name="transactions")
    op.drop_index("ix_transactions_account_id_booking_date", table_name="transactions")
    op.drop_table("transactions")
    op.drop_table("recurring_transactions")
    op.drop_table("positions")
    op.drop_table("portfolio_cash_snapshots")
    op.drop_index(op.f("ix_investment_orders_executed_at"), table_name="investment_orders")
    op.drop_table("investment_orders")
    op.drop_index(op.f("ix_dividends_paid_on"), table_name="dividends")
    op.drop_table("dividends")
    op.drop_table("portfolios")
    op.drop_table("merchants")
    op.drop_table("budgets")
    op.drop_table("balances")
    op.drop_index(op.f("ix_sync_logs_source_id"), table_name="sync_logs")
    op.drop_table("sync_logs")
    op.drop_table("subcategories")
    op.drop_table("accounts")
    op.drop_index(op.f("ix_transaction_rules_priority"), table_name="transaction_rules")
    op.drop_table("transaction_rules")
    op.drop_table("tags")
    op.drop_table("net_worth_snapshots")
    op.drop_table("income_classifications")
    op.drop_table("fx_rates")
    op.drop_table("categories")
    op.drop_table("account_sources")
