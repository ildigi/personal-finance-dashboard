"""Portafoglio: data di inizio del calcolo dei rendimenti (Fase 7)

- `portfolios.tracking_start`: se impostata, capitale versato, ordini, dividendi e P/L
  realizzato contano solo da quel giorno; il saldo a quella data vale come capitale di partenza.

Revision ID: 7d2c9b4e1f30
Revises: 4ae1e91f8493
Create Date: 2026-10-05 20:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7d2c9b4e1f30"
down_revision: str | None = "4ae1e91f8493"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("portfolios", sa.Column("tracking_start", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("portfolios", "tracking_start")
