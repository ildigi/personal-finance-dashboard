"""Configurazione dell'accesso, da terminale (la password non passa mai da altrove).

    uv run python -m app.auth.cli setup        # password + QR per l'app di autenticazione
    uv run python -m app.auth.cli status       # configurato? quante sessioni aperte?
    uv run python -m app.auth.cli logout-all   # chiude le sessioni su tutti i dispositivi
    uv run python -m app.auth.cli reset --yes  # cancella password e codice (poi rifai setup)

L'accesso si attiva con `AUTH_ENABLED=true` in `backend/.env` (o nell'ambiente del server).
"""

from __future__ import annotations

import argparse
import getpass
import sys

import segno
from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import Session

from app.auth.service import (
    MIN_PASSWORD_LENGTH,
    AuthError,
    check_totp,
    close_all_sessions,
    is_configured,
    setup_credentials,
)
from app.core.config import get_settings
from app.models import AuthCredential, AuthSession


def _setup(session: Session, force: bool) -> int:
    if is_configured(session) and not force:
        print("L'accesso è già configurato. Per sostituire password e codice: setup --force")
        return 1
    print(f"Scegli una password di almeno {MIN_PASSWORD_LENGTH} caratteri (non viene mostrata).")
    password = getpass.getpass("Password: ")
    if getpass.getpass("Ripeti la password: ") != password:
        print("Le due password non coincidono: niente è cambiato.")
        return 1
    try:
        enrollment = setup_credentials(session, password)
    except AuthError as exc:
        print(exc)
        return 1
    print("\nInquadra il codice QR con l'app di autenticazione (Google Authenticator,")
    print("Microsoft Authenticator, 1Password, Aegis, ...):\n")
    segno.make(enrollment.uri, error="m").terminal(compact=True)
    print("\nNon riesci a inquadrarlo? Inserisci a mano questa chiave (tipo: basata sul tempo):")
    print(f"  {enrollment.secret}\n")
    for _ in range(3):
        code = input("Scrivi il codice di 6 cifre che vedi nell'app: ")
        if check_totp(session, code):
            session.commit()
            print("Fatto: accesso configurato. Le sessioni aperte prima sono state chiuse.")
            if not get_settings().auth_enabled:
                print("Nota: l'accesso è ancora spento. Si attiva con AUTH_ENABLED=true.")
            return 0
        print("Codice non valido, riprova (controlla anche l'ora del telefono).")
    session.rollback()
    print("Configurazione annullata: niente è cambiato.")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.auth.cli", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    setup = sub.add_parser("setup", help="imposta password e codice TOTP")
    setup.add_argument("--force", action="store_true", help="sostituisce quelli esistenti")
    sub.add_parser("status", help="mostra se l'accesso è configurato e attivo")
    sub.add_parser("logout-all", help="chiude tutte le sessioni")
    reset = sub.add_parser("reset", help="cancella password e codice")
    reset.add_argument("--yes", action="store_true", help="conferma")
    args = parser.parse_args()

    engine = create_engine(get_settings().db_url())
    with Session(engine) as session:
        if args.command == "setup":
            return _setup(session, args.force)
        if args.command == "status":
            sessions = session.scalar(select(func.count()).select_from(AuthSession)) or 0
            print(f"Accesso attivo (AUTH_ENABLED): {'sì' if get_settings().auth_enabled else 'no'}")
            print(f"Password e codice configurati: {'sì' if is_configured(session) else 'no'}")
            print(f"Sessioni aperte: {sessions}")
            return 0
        if args.command == "logout-all":
            closed = close_all_sessions(session)
            session.commit()
            print(f"Sessioni chiuse: {closed}")
            return 0
        if args.command == "reset":
            if not args.yes:
                print("Aggiungi --yes per confermare: password e codice verranno cancellati.")
                return 2
            session.execute(delete(AuthSession))
            session.execute(delete(AuthCredential))
            session.commit()
            print("Password e codice cancellati. Rifai: python -m app.auth.cli setup")
            return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
