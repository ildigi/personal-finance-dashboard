"""Comandi di sincronizzazione da terminale.

uv run python -m app.ingestion.cli mock-setup      # crea le sorgenti di prova e le sincronizza
uv run python -m app.ingestion.cli sync --all      # sincronizza tutte le sorgenti attive
uv run python -m app.ingestion.cli sync --source 3
uv run python -m app.ingestion.cli mock-remove --yes   # elimina SOLO i dati di prova
uv run python -m app.ingestion.cli classify        # riclassifica tutti i movimenti
uv run python -m app.ingestion.cli t212-setup      # collega il conto Trading 212 e lo sincronizza
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingestion.mock_setup import ensure_mock_sources, remove_mock_data
from app.ingestion.runner import SyncSummary, classify_job, run_sync
from app.ingestion.trading212_setup import ensure_trading212_source
from app.integrations.trading212.client import Trading212Error
from app.models import AccountSource
from app.models.enums import Provider, SourceStatus


def _print(source: AccountSource, summary: SyncSummary) -> None:
    print(f"\n{source.display_name}: {summary.status}")
    for job in summary.jobs:
        extra = ", ".join(f"{k}={v}" for k, v in sorted(job.details.items()))
        line = (
            f"  {job.job:<13} letti {job.fetched:>4} · nuovi {job.created:>4}"
            f" · aggiornati {job.updated:>4}"
        )
        print(
            line
            + (f" ({extra})" if extra else "")
            + (f"  ERRORE: {job.error}" if job.error else "")
        )


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Sincronizzazione delle sorgenti")
    parser.add_argument("--test", action="store_true", help="usa il database dei test")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("mock-setup", help="crea le sorgenti di prova e le sincronizza")
    sync = sub.add_parser("sync", help="sincronizza una o tutte le sorgenti")
    group = sync.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true")
    group.add_argument("--source", type=int)
    remove = sub.add_parser("mock-remove", help="elimina tutti i dati di prova")
    remove.add_argument("--yes", action="store_true", help="conferma l'eliminazione")
    sub.add_parser("classify", help="riclassifica tutti i movimenti")
    sub.add_parser("t212-setup", help="collega il conto Trading 212 (chiave nei segreti)")
    args = parser.parse_args()

    engine = create_engine(get_settings().db_url(test=args.test))
    failed = False
    with Session(engine, expire_on_commit=False) as session:
        if args.command == "mock-remove":
            if not args.yes:
                print("Aggiungi --yes per confermare: verranno eliminati tutti i dati di prova.")
                return 2
            report = remove_mock_data(session)
            session.commit()
            print(
                f"Eliminati: {report.sources} sorgenti, {report.accounts} conti, "
                f"{report.transactions} movimenti di prova, {report.merchants} merchant "
                f"riconosciuti e {report.rules} regole imparate collegate."
            )
            return 0

        if args.command == "classify":
            stats = classify_job(session)
            session.commit()
            extra = ", ".join(f"{k}={v}" for k, v in sorted(stats.details.items()))
            print(f"Movimenti: {stats.fetched} · cambiati {stats.updated} ({extra})")
            return 0

        if args.command == "mock-setup":
            sources = ensure_mock_sources(session)
            session.commit()
        elif args.command == "t212-setup":
            try:
                sources = [ensure_trading212_source(session)]
            except Trading212Error as exc:
                print(exc)
                return 1
            session.commit()
        elif args.all:
            sources = list(
                session.scalars(
                    select(AccountSource).where(
                        AccountSource.status != SourceStatus.DISABLED,
                        AccountSource.provider != Provider.MANUAL,
                    )
                )
            )
        else:
            source = session.get(AccountSource, args.source)
            if source is None:
                print(f"Sorgente {args.source} inesistente")
                return 1
            sources = [source]

        for source in sources:
            summary = run_sync(session, source)
            _print(source, summary)
            failed |= summary.status != "success"
    engine.dispose()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
