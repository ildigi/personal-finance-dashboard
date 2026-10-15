"""categoria "Altro" separata da "Da classificare"

La categoria di sistema "Altro / Da classificare" mescolava due cose: una categoria
vera (spese varie, commissioni) e lo stato "nessun passo ha riconosciuto il movimento".
Diventa "Altro" (codice `altro`); "Da classificare" resta solo uno stato (categoria
vuota). Nome e icona cambiano solo se non li hai già personalizzati.

Revision ID: 94dcfc6b8873
Revises: 5951e671bf42
Create Date: 2026-10-05 12:00:00.000000+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "94dcfc6b8873"
down_revision: str | None = "5951e671bf42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE categories SET name = 'Altro' "
        "WHERE code = 'da_classificare' AND name = 'Altro / Da classificare'"
    )
    op.execute(
        "UPDATE categories SET icon = 'shapes' "
        "WHERE code = 'da_classificare' AND icon = 'circle-help'"
    )
    op.execute("UPDATE categories SET code = 'altro' WHERE code = 'da_classificare'")


def downgrade() -> None:
    op.execute("UPDATE categories SET code = 'da_classificare' WHERE code = 'altro'")
    op.execute(
        "UPDATE categories SET icon = 'circle-help' "
        "WHERE code = 'da_classificare' AND icon = 'shapes'"
    )
    op.execute(
        "UPDATE categories SET name = 'Altro / Da classificare' "
        "WHERE code = 'da_classificare' AND name = 'Altro'"
    )
