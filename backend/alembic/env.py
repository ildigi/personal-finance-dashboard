"""Ambiente Alembic.

L'URL arriva dalla configurazione dell'app; `-x db=test` usa il database dei test.
I test possono passare una connessione già aperta in `config.attributes["connection"]`.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy import Connection, create_engine, pool

import app.models  # noqa: F401  (registra tutte le tabelle)
from app.core.config import get_settings
from app.db.base import Base

config = context.config
target_metadata = Base.metadata


def _run(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    use_test = context.get_x_argument(as_dictionary=True).get("db") == "test"
    context.configure(
        url=get_settings().db_url(test=use_test).render_as_string(hide_password=True),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return

    use_test = context.get_x_argument(as_dictionary=True).get("db") == "test"
    engine = create_engine(get_settings().db_url(test=use_test), poolclass=pool.NullPool)
    with engine.connect() as conn:
        _run(conn)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
