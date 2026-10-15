"""Backup cifrati del database (SPEC §15).

- **Creazione:** `pg_dump` (formato custom) → cifrato con AES-256-GCM → file
  `${DATA_DIR}/backups/finance-AAAAMMGG-HHMMSS.fdbk`. In chiaro il dump non tocca mai il
  disco: passa dalla memoria (il database è di pochi MB).
- **Chiave:** `${DATA_DIR}/secrets/backup.key`, separata da `app.key`. Senza questa chiave
  i backup non si aprono: va conservata anche fuori dal computer (vedi DEPLOY.md).
- **Conservazione:** si tengono gli ultimi `BACKUP_KEEP` file.
- **Prova di ripristino:** il backup si decifra e si ripristina in un database di prova
  (`BACKUP_VERIFY_DB`, deve finire con `_test` o `_restore`), si confrontano le righe di
  ogni tabella con il database vero, poi il database di prova si svuota.
- La password del database passa a `pg_dump` via variabile d'ambiente, mai sulla riga di
  comando (sarebbe visibile ad altri processi).
"""

from __future__ import annotations

import base64
import contextlib
import logging
import os
import secrets
import shutil
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import URL, create_engine, inspect, text

from app.core.config import Settings, get_settings

log = logging.getLogger(__name__)

MAGIC = b"FDBK1"
NONCE_BYTES = 12
KEY_FILE = "backup.key"
SUFFIX = ".fdbk"
#: Su Windows, dove di solito sono gli strumenti di PostgreSQL se non sono nel PATH.
WINDOWS_PG_BIN = Path("D:/Programs/PostgreSQL/18/bin")


class BackupError(RuntimeError):
    """Messaggio leggibile, senza password né dati."""


@dataclass(frozen=True)
class BackupFile:
    path: Path
    created_at: datetime
    size: int


@dataclass(frozen=True)
class VerifyReport:
    file: Path
    tables: int
    rows: int
    mismatches: list[str]

    @property
    def ok(self) -> bool:
        return not self.mismatches


# --- Chiave e cifratura -----------------------------------------------------------------


def key_path(settings: Settings | None = None) -> Path:
    return (settings or get_settings()).secrets_dir / KEY_FILE


def load_or_create_key(path: Path) -> bytes:
    if path.is_file():
        return base64.b64decode(path.read_bytes().strip())
    path.parent.mkdir(parents=True, exist_ok=True)
    key = AESGCM.generate_key(bit_length=256)
    with path.open("xb") as f:  # mai sovrascrivere una chiave esistente
        f.write(base64.b64encode(key))
    with contextlib.suppress(OSError):
        path.chmod(0o600)  # su Linux; su Windows valgono i permessi della cartella
    return key


def encrypt(data: bytes, key: bytes) -> bytes:
    nonce = secrets.token_bytes(NONCE_BYTES)
    return MAGIC + nonce + AESGCM(key).encrypt(nonce, data, MAGIC)


def decrypt(blob: bytes, key: bytes) -> bytes:
    if not blob.startswith(MAGIC):
        raise BackupError("Non è un backup della dashboard")
    nonce = blob[len(MAGIC) : len(MAGIC) + NONCE_BYTES]
    try:
        return AESGCM(key).decrypt(nonce, blob[len(MAGIC) + NONCE_BYTES :], MAGIC)
    except Exception:
        raise BackupError("Backup non decifrabile: chiave sbagliata o file danneggiato") from None


# --- Strumenti di PostgreSQL ------------------------------------------------------------


def pg_tool(name: str, settings: Settings | None = None) -> str:
    configured = (settings or get_settings()).pg_bin_dir
    candidates = [configured / name] if configured else []
    candidates.append(WINDOWS_PG_BIN / f"{name}.exe")
    for candidate in candidates:
        for path in (candidate, candidate.with_suffix(".exe")):
            if path.is_file():
                return str(path)
    found = shutil.which(name)
    if found:
        return found
    raise BackupError(f"{name} non trovato: imposta PG_BIN_DIR")


def _connection_args(url: URL) -> tuple[list[str], dict[str, str]]:
    args = [
        f"--host={url.host or '127.0.0.1'}",
        f"--port={url.port or 5432}",
        f"--username={url.username}",
        f"--dbname={url.database}",
    ]
    env = {**os.environ, "PGPASSWORD": url.password or "", "PGCONNECT_TIMEOUT": "10"}
    return args, env


def _run(command: list[str], env: dict[str, str], stdin: bytes | None = None) -> bytes:
    try:
        done = subprocess.run(  # noqa: S603 - argomenti fissi, nessuna shell
            command, input=stdin, capture_output=True, env=env, check=False, timeout=600
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BackupError(f"{Path(command[0]).name} non eseguito ({type(exc).__name__})") from None
    if done.returncode != 0:
        # Solo la prima riga dell'errore: niente dump di dati nei log.
        first = (done.stderr.decode(errors="replace").strip().splitlines() or ["errore"])[0]
        raise BackupError(f"{Path(command[0]).name}: {first[:200]}")
    return done.stdout


# --- Operazioni ---------------------------------------------------------------------------


def backups_dir(settings: Settings | None = None) -> Path:
    return (settings or get_settings()).data_dir / "backups"


def list_backups(settings: Settings | None = None) -> list[BackupFile]:
    folder = backups_dir(settings)
    if not folder.is_dir():
        return []
    files = []
    for path in folder.glob(f"finance-*{SUFFIX}"):
        stamp = path.stem.removeprefix("finance-")
        try:
            created = datetime.strptime(stamp, "%Y%m%d-%H%M%S").replace(tzinfo=UTC)
        except ValueError:
            continue
        files.append(BackupFile(path=path, created_at=created, size=path.stat().st_size))
    return sorted(files, key=lambda f: f.created_at, reverse=True)


def create_backup(
    settings: Settings | None = None, *, url: URL | None = None, now: datetime | None = None
) -> BackupFile:
    """`url`: il database da salvare (di norma quello dell'app)."""
    settings = settings or get_settings()
    now = now or datetime.now(UTC)
    args, env = _connection_args(url or settings.db_url())
    dump = _run(
        [pg_tool("pg_dump", settings), "--format=custom", "--no-owner", "--no-privileges", *args],
        env,
    )
    blob = encrypt(dump, load_or_create_key(key_path(settings)))
    folder = backups_dir(settings)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"finance-{now:%Y%m%d-%H%M%S}{SUFFIX}"
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(blob)
    tmp.replace(path)  # mai un backup scritto a metà con il nome giusto
    prune(settings)
    log.info("Backup creato: %s (%d kB)", path.name, len(blob) // 1024)
    return BackupFile(path=path, created_at=now, size=len(blob))


def prune(settings: Settings | None = None) -> int:
    settings = settings or get_settings()
    removed = 0
    for old in list_backups(settings)[settings.backup_keep :]:
        old.path.unlink(missing_ok=True)
        removed += 1
    return removed


def _counts(url: URL) -> dict[str, int]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            tables = [t for t in inspect(conn).get_table_names() if t != "alembic_version"]
            return {
                t: int(conn.execute(text(f'SELECT count(*) FROM "{t}"')).scalar() or 0)  # noqa: S608
                for t in tables
            }
    finally:
        engine.dispose()


def _wipe(url: URL) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
    finally:
        engine.dispose()


def verify_url(settings: Settings | None = None) -> URL:
    settings = settings or get_settings()
    name = settings.backup_verify_db
    if not (name.endswith("_test") or name.endswith("_restore")):
        raise BackupError("BACKUP_VERIFY_DB deve finire con _test o _restore")
    return settings.db_url().set(database=name)


def verify_backup(path: Path, settings: Settings | None = None) -> VerifyReport:
    """Ripristina il backup nel database di prova e lo confronta con quello vero."""
    settings = settings or get_settings()
    dump = decrypt(path.read_bytes(), load_or_create_key(key_path(settings)))
    target = verify_url(settings)
    _wipe(target)
    args, env = _connection_args(target)
    try:
        _run([pg_tool("pg_restore", settings), "--no-owner", "--no-privileges", *args], env, dump)
        restored = _counts(target)
    finally:
        _wipe(target)  # i dati veri non restano nel database di prova
    live = _counts(settings.db_url())
    mismatches = [
        f"{t}: {restored.get(t, 'mancante')} nel backup, {n} ora"
        for t, n in sorted(live.items())
        if restored.get(t) != n
    ]
    return VerifyReport(
        file=path, tables=len(restored), rows=sum(restored.values()), mismatches=mismatches
    )


def restore_backup(path: Path, settings: Settings | None = None) -> None:
    """Sostituisce il database vero con il backup (tutto in una transazione)."""
    settings = settings or get_settings()
    dump = decrypt(path.read_bytes(), load_or_create_key(key_path(settings)))
    args, env = _connection_args(settings.db_url())
    _run(
        [
            pg_tool("pg_restore", settings),
            "--clean",
            "--if-exists",
            "--single-transaction",
            "--no-owner",
            "--no-privileges",
            *args,
        ],
        env,
        dump,
    )
