"""Trading 212: Pie e movimenti di cassa (Fase 7)

- tabelle `pies` e `pie_instruments`: stato attuale delle Pie, sostituito a ogni sync;
- `investment_cash_flows.type`: oltre a depositi e prelievi, `interest` (interessi sulla
  liquidità) e `fee` (commissioni), che fanno parte del rendimento e non del capitale versato;
- nuovo passo di `sync_logs`: `pies`.

Revision ID: 4ae1e91f8493
Revises: c3a8f1d2e4b7
Create Date: 2026-10-05 13:57:04.714678+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "4ae1e91f8493"
down_revision: str | None = "c3a8f1d2e4b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FLOW_TYPES_OLD = "'deposit', 'withdrawal'"
_FLOW_TYPES_NEW = _FLOW_TYPES_OLD + ", 'interest', 'fee'"
_SYNC_JOBS_OLD = (
    "'accounts', 'balances', 'transactions', 'portfolio', 'orders', 'dividends', "
    "'cash_flows', 'fx_rates', 'classification'"
)
_SYNC_JOBS_NEW = _SYNC_JOBS_OLD + ", 'pies'"


def _replace_check(table: str, name: str, condition: str) -> None:
    op.drop_constraint(op.f(name), table, type_="check")
    op.create_check_constraint(op.f(name), table, condition)


def upgrade() -> None:
    op.create_table(
        "pies",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("portfolio_id", sa.BigInteger(), nullable=False),
        sa.Column("external_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("icon", sa.Text(), nullable=True),
        sa.Column("goal_eur", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("dividend_action", sa.Text(), nullable=True),
        sa.Column("cash_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("invested_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("value_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("result_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("dividends_gained_eur", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["portfolio_id"],
            ["portfolios.id"],
            name=op.f("fk_pies_portfolio_id_portfolios"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pies")),
        sa.UniqueConstraint(
            "portfolio_id", "external_id", name=op.f("uq_pies_portfolio_id_external_id")
        ),
    )
    op.create_table(
        "pie_instruments",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("pie_id", sa.BigInteger(), nullable=False),
        sa.Column("ticker", sa.Text(), nullable=False),
        sa.Column("expected_share", sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column("current_share", sa.Numeric(precision=9, scale=6), nullable=False),
        sa.Column("owned_quantity", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("invested_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("value_eur", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("result_eur", sa.Numeric(precision=14, scale=2), nullable=False),
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
            "expected_share BETWEEN 0 AND 1", name=op.f("ck_pie_instruments_expected_share_range")
        ),
        sa.ForeignKeyConstraint(
            ["pie_id"], ["pies.id"], name=op.f("fk_pie_instruments_pie_id_pies"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pie_instruments")),
        sa.UniqueConstraint("pie_id", "ticker", name=op.f("uq_pie_instruments_pie_id_ticker")),
    )
    _replace_check(
        "investment_cash_flows",
        "ck_investment_cash_flows_type_valid",
        f"type IN ({_FLOW_TYPES_NEW})",
    )
    _replace_check("sync_logs", "ck_sync_logs_job_valid", f"job IN ({_SYNC_JOBS_NEW})")


def downgrade() -> None:
    op.execute("DELETE FROM sync_logs WHERE job = 'pies'")
    _replace_check("sync_logs", "ck_sync_logs_job_valid", f"job IN ({_SYNC_JOBS_OLD})")
    op.execute("DELETE FROM investment_cash_flows WHERE type IN ('interest', 'fee')")
    _replace_check(
        "investment_cash_flows",
        "ck_investment_cash_flows_type_valid",
        f"type IN ({_FLOW_TYPES_OLD})",
    )
    op.drop_table("pie_instruments")
    op.drop_table("pies")
