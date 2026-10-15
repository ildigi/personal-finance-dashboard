"""budget e ricorrenze (Fase 6)

- `recurring_transactions.match_key`: la controparte della serie (merchant, IBAN, nome
  o descrizione), con verso e importo decide quali movimenti ne fanno parte;
- `recurring_transactions.kind`: tipo dei movimenti della serie (spesa, entrata, ...);
- `budgets`: al massimo un budget aperto (`valid_to` nullo) per categoria/sottocategoria.

Revision ID: c3a8f1d2e4b7
Revises: 94dcfc6b8873
Create Date: 2026-10-05 18:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3a8f1d2e4b7"
down_revision: str | None = "94dcfc6b8873"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KINDS = "'expense', 'income', 'internal_transfer', 'investment_transfer', 'refund', 'fee', 'other'"


def upgrade() -> None:
    # Le ricorrenze finora non esistevano: nessuna riga da migrare.
    op.execute("UPDATE transactions SET recurring_id = NULL WHERE recurring_id IS NOT NULL")
    op.execute("DELETE FROM recurring_transactions")
    op.add_column("recurring_transactions", sa.Column("match_key", sa.Text(), nullable=False))
    op.add_column("recurring_transactions", sa.Column("kind", sa.Text(), nullable=False))
    op.create_check_constraint(
        op.f("ck_recurring_transactions_kind_valid"),
        "recurring_transactions",
        f"kind IN ({_KINDS})",
    )
    op.create_index(
        op.f("ix_recurring_transactions_match_key"), "recurring_transactions", ["match_key"]
    )
    op.create_index(op.f("ix_transactions_recurring_id"), "transactions", ["recurring_id"])

    op.create_index(
        "uq_budgets_open_line",
        "budgets",
        ["category_id", sa.text("coalesce(subcategory_id, 0)")],
        unique=True,
        postgresql_where=sa.text("valid_to IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_budgets_open_line", table_name="budgets")
    op.drop_index(op.f("ix_transactions_recurring_id"), table_name="transactions")
    op.drop_index(op.f("ix_recurring_transactions_match_key"), table_name="recurring_transactions")
    op.drop_constraint(
        op.f("ck_recurring_transactions_kind_valid"), "recurring_transactions", type_="check"
    )
    op.drop_column("recurring_transactions", "kind")
    op.drop_column("recurring_transactions", "match_key")
