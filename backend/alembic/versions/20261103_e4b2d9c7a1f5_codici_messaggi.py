"""Messaggi come codici con parametri (ADR 0006, fase I3)

Il "perché" della classificazione e gli errori di sincronizzazione diventano un codice con i
suoi parametri: il testo lo sceglie il frontend nella lingua dell'utente. Le colonne di testo
esistenti restano per le righe già salvate (il frontend le mostra quando manca il codice);
nessuna riga viene riscritta qui. Le note di classificazione si rigenerano da sole alla prima
riclassificazione.

Revision ID: e4b2d9c7a1f5
Revises: a1f3c5e7b9d2
Create Date: 2026-11-03 21:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e4b2d9c7a1f5"
down_revision: str | None = "a1f3c5e7b9d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("classification_reason", sa.Text(), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("classification_params", postgresql.JSONB(), nullable=True),
    )
    op.add_column("sync_logs", sa.Column("error_code", sa.Text(), nullable=True))
    op.add_column("sync_logs", sa.Column("error_params", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("sync_logs", "error_params")
    op.drop_column("sync_logs", "error_code")
    op.drop_column("transactions", "classification_params")
    op.drop_column("transactions", "classification_reason")
