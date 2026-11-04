"""Impostazioni dell'installazione: la lingua dei dati del seed (ADR 0006, fase I4)

Tabella nuova e vuota. La riga `data_locale` la scrive solo il seed su un database vuoto;
un database già popolato resta senza, e vale l'italiano.

Revision ID: b7d1e3f5a9c2
Revises: e4b2d9c7a1f5
Create Date: 2026-11-04 10:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7d1e3f5a9c2"
down_revision: str | None = "e4b2d9c7a1f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
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
        sa.PrimaryKeyConstraint("key", name=op.f("pk_app_settings")),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
