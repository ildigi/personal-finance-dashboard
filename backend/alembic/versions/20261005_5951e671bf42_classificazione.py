"""classificazione (Fase 5)

- `merchants.origin`: seed / auto / user (i merchant creati in automatico si possono
  ripulire, quelli scelti da te no);
- `transaction_rules.code`: chiave stabile delle regole di sistema del seed;
- `transactions.classification_note`: il perché della classificazione, leggibile;
- nuovi campi di `manual_overrides`: `transfer_pair_id`, `refund_of_id`;
- nuovo passo di `sync_logs`: `classification`.

Revision ID: 5951e671bf42
Revises: b9b2e18150b5
Create Date: 2026-10-05 09:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5951e671bf42"
down_revision: str | None = "b9b2e18150b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OVERRIDE_FIELDS_OLD = (
    "'category_id', 'subcategory_id', 'kind', 'income_type_id', 'merchant_id', 'notes'"
)
_OVERRIDE_FIELDS_NEW = _OVERRIDE_FIELDS_OLD + ", 'transfer_pair_id', 'refund_of_id'"
_SYNC_JOBS_OLD = (
    "'accounts', 'balances', 'transactions', 'portfolio', 'orders', 'dividends', "
    "'cash_flows', 'fx_rates'"
)
_SYNC_JOBS_NEW = _SYNC_JOBS_OLD + ", 'classification'"


def _replace_check(table: str, name: str, condition: str) -> None:
    op.drop_constraint(op.f(name), table, type_="check")
    op.create_check_constraint(op.f(name), table, condition)


def upgrade() -> None:
    op.add_column(
        "merchants", sa.Column("origin", sa.Text(), server_default="auto", nullable=False)
    )
    op.create_check_constraint(
        op.f("ck_merchants_origin_valid"), "merchants", "origin IN ('seed', 'auto', 'user')"
    )

    op.add_column("transaction_rules", sa.Column("code", sa.Text(), nullable=True))
    op.create_unique_constraint(op.f("uq_transaction_rules_code"), "transaction_rules", ["code"])

    op.add_column("transactions", sa.Column("classification_note", sa.Text(), nullable=True))

    _replace_check(
        "manual_overrides", "ck_manual_overrides_field_valid", f"field IN ({_OVERRIDE_FIELDS_NEW})"
    )
    _replace_check("sync_logs", "ck_sync_logs_job_valid", f"job IN ({_SYNC_JOBS_NEW})")


def downgrade() -> None:
    op.execute("DELETE FROM sync_logs WHERE job = 'classification'")
    _replace_check("sync_logs", "ck_sync_logs_job_valid", f"job IN ({_SYNC_JOBS_OLD})")
    op.execute("DELETE FROM manual_overrides WHERE field IN ('transfer_pair_id', 'refund_of_id')")
    _replace_check(
        "manual_overrides", "ck_manual_overrides_field_valid", f"field IN ({_OVERRIDE_FIELDS_OLD})"
    )

    op.drop_column("transactions", "classification_note")
    op.drop_constraint(op.f("uq_transaction_rules_code"), "transaction_rules", type_="unique")
    op.drop_column("transaction_rules", "code")
    op.drop_constraint(op.f("ck_merchants_origin_valid"), "merchants", type_="check")
    op.drop_column("merchants", "origin")
