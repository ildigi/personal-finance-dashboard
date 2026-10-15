"""Backup cifrati da terminale.

uv run python -m app.backup.cli create [--verify]   # nuovo backup (e prova di ripristino)
uv run python -m app.backup.cli list                # backup presenti
uv run python -m app.backup.cli verify [FILE]       # prova di ripristino (default: l'ultimo)
uv run python -m app.backup.cli restore FILE --yes  # SOSTITUISCE il database con il backup
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.backup.service import (
    BackupError,
    create_backup,
    list_backups,
    restore_backup,
    verify_backup,
)


def _verify(path: Path, compare: bool) -> int:
    report = verify_backup(path)
    print(f"Ripristino di prova riuscito: {report.tables} tabelle, {report.rows} righe.")
    if not compare:
        return 0
    if report.ok:
        print("Righe identiche al database attuale in ogni tabella.")
        return 0
    print("Differenze rispetto a ora (normali se nel frattempo sono arrivati dati nuovi):")
    for line in report.mismatches:
        print(f"  {line}")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.backup.cli", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create", help="crea un backup cifrato")
    create.add_argument("--verify", action="store_true", help="e prova subito a ripristinarlo")
    sub.add_parser("list", help="elenca i backup")
    verify = sub.add_parser("verify", help="prova di ripristino in un database di prova")
    verify.add_argument("file", nargs="?", type=Path)
    restore = sub.add_parser("restore", help="sostituisce il database con un backup")
    restore.add_argument("file", type=Path)
    restore.add_argument("--yes", action="store_true", help="conferma")
    args = parser.parse_args()

    try:
        if args.command == "create":
            made = create_backup()
            print(f"Backup creato: {made.path} ({made.size // 1024} kB)")
            return _verify(made.path, compare=True) if args.verify else 0
        if args.command == "list":
            files = list_backups()
            if not files:
                print("Nessun backup.")
            for f in files:
                print(f"{f.created_at:%Y-%m-%d %H:%M} UTC  {f.size // 1024:>6} kB  {f.path.name}")
            return 0
        if args.command == "verify":
            files = list_backups()
            path = args.file or (files[0].path if files else None)
            if path is None:
                print("Nessun backup da provare.")
                return 1
            return _verify(path, compare=args.file is None and path == files[0].path)
        if args.command == "restore":
            if not args.yes:
                print("Aggiungi --yes: il database attuale verrà sostituito dal backup.")
                return 2
            print("Prima del ripristino faccio un backup dello stato attuale...")
            print(f"  {create_backup().path.name}")
            restore_backup(args.file)
            print("Ripristino completato. Riavvia il backend.")
            return 0
    except BackupError as exc:
        print(f"Errore: {exc}")
        return 1
    return 1


if __name__ == "__main__":
    sys.exit(main())
