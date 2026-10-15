from __future__ import annotations

import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.backup import service
from app.backup.scheduler import BackupScheduler
from app.core.config import Settings, get_settings


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Cartella dati temporanea: chiave e backup dei test non toccano quelli veri."""
    return get_settings().model_copy(update={"data_dir": tmp_path, "backup_keep": 3})


def test_encryption_round_trip_and_tampering() -> None:
    key = AESGCM.generate_key(bit_length=256)
    blob = service.encrypt(b"dati del database", key)
    assert blob.startswith(service.MAGIC)
    assert b"dati del database" not in blob
    assert service.decrypt(blob, key) == b"dati del database"
    with pytest.raises(service.BackupError, match="chiave sbagliata"):
        service.decrypt(blob, AESGCM.generate_key(bit_length=256))
    tampered = blob[:-1] + bytes([blob[-1] ^ 1])
    with pytest.raises(service.BackupError):
        service.decrypt(tampered, key)
    with pytest.raises(service.BackupError, match="Non è un backup"):
        service.decrypt(b"altro file", key)


def test_key_is_created_once(settings: Settings) -> None:
    path = service.key_path(settings)
    first = service.load_or_create_key(path)
    assert service.load_or_create_key(path) == first
    assert len(first) == 32


def test_prune_keeps_the_newest(settings: Settings) -> None:
    folder = service.backups_dir(settings)
    folder.mkdir(parents=True)
    for day in range(1, 6):
        (folder / f"finance-2026100{day}-120000{service.SUFFIX}").write_bytes(b"x")
    (folder / "appunti.txt").write_text("non è un backup")
    assert service.prune(settings) == 2
    names = [f.path.name for f in service.list_backups(settings)]
    assert names == [f"finance-2026100{d}-120000{service.SUFFIX}" for d in (5, 4, 3)]
    assert (folder / "appunti.txt").exists()


def test_scheduler_runs_only_when_due(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    made: list[datetime] = []
    now = datetime(2026, 10, 6, 12, tzinfo=UTC)
    monkeypatch.setattr("app.backup.scheduler.create_backup", lambda s: made.append(now))
    scheduler = BackupScheduler(settings, now=lambda: now)
    assert scheduler.run_if_due()  # nessun backup ancora
    folder = service.backups_dir(settings)
    folder.mkdir(parents=True, exist_ok=True)
    recent = now - timedelta(hours=2)
    (folder / f"finance-{recent:%Y%m%d-%H%M%S}{service.SUFFIX}").write_bytes(b"x")
    assert not scheduler.run_if_due()
    assert len(made) == 1


def test_real_dump_of_the_test_database(settings: Settings) -> None:
    try:
        restore = service.pg_tool("pg_restore", settings)
    except service.BackupError:
        pytest.skip("strumenti di PostgreSQL non disponibili")
    made = service.create_backup(settings, url=get_settings().db_url(test=True))
    assert made.path.parent == service.backups_dir(settings)
    blob = made.path.read_bytes()
    dump = service.decrypt(blob, service.load_or_create_key(service.key_path(settings)))
    listing = subprocess.run(  # noqa: S603
        [restore, "--list"], input=dump, capture_output=True, check=True
    ).stdout.decode()
    assert "TABLE public transactions" in listing
    assert "TABLE public auth_credentials" in listing


def test_verify_refuses_a_real_database(settings: Settings) -> None:
    unsafe = settings.model_copy(update={"backup_verify_db": "finance"})
    with pytest.raises(service.BackupError, match="_test o _restore"):
        service.verify_url(unsafe)
