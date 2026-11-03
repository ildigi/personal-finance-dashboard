"""Fixture comuni.

I test girano SOLO sul database dei test (`DB_NAME_TEST`): lo schema viene
ricreato con le migrazioni a inizio sessione e ogni test lavora dentro una
transazione annullata alla fine, quindi i test non lasciano traccia.

Le fixture fanno `commit()`: in modalità "create_savepoint" chiude solo il
savepoint, così un rollback causato da una richiesta fallita non cancella i
dati preparati dal test, ma la transazione esterna resta e viene annullata.
"""

from __future__ import annotations

import os

os.environ["APP_ENV"] = "test"  # prima di importare l'app: niente log su file

import sys
from collections.abc import Callable, Iterator
from datetime import date
from decimal import Decimal
from itertools import count
from typing import NoReturn

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, get_settings
from app.db.seed import run_seed
from app.db.session import get_db
from app.main import create_app
from app.models import Account, AccountSource, Transaction
from app.services.transactions import compute_dedupe_hash


def alembic_config() -> Config:
    return Config(BACKEND_DIR / "alembic.ini")


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = get_settings().db_url(test=True)
    if not (url.database or "").endswith("_test"):
        pytest.exit(f"Rifiuto di eseguire i test su un database non di test: {url.database}")

    test_engine = create_engine(url)
    with test_engine.begin() as conn:
        cfg = alembic_config()
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()


@pytest.fixture
def seeded(db: Session) -> Session:
    run_seed(db)
    db.commit()
    return db


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app = create_app()

    def _override() -> Iterator[Session]:
        try:
            yield db
        except Exception:
            db.rollback()
            raise

    app.dependency_overrides[get_db] = _override
    with TestClient(app, base_url="http://localhost") as test_client:
        yield test_client


# --- Fabbriche di dati -----------------------------------------------------------

_seq = count(1)


@pytest.fixture
def source(db: Session) -> AccountSource:
    src = AccountSource(provider="mock", institution="Banca Test", display_name="Mock")
    db.add(src)
    db.commit()
    return src


@pytest.fixture
def account(db: Session, source: AccountSource) -> Account:
    acc = Account(
        source_id=source.id,
        external_id=f"acc-{next(_seq)}",
        name="Conto corrente",
        type="checking",
        currency="EUR",
        institution="Banca Test",
    )
    db.add(acc)
    db.commit()
    return acc


def make_synced_transaction(
    db: Session,
    account: Account,
    *,
    amount: str = "-10.00",
    description: str = "PAGAMENTO POS BAR CENTRALE",
    booking_date: date = date(2026, 9, 15),
    external_id: str | None = "auto",
    **extra: object,
) -> Transaction:
    """Movimento come lo creerebbe una sincronizzazione (non manuale)."""
    value = Decimal(amount)
    tx = Transaction(
        account_id=account.id,
        external_id=f"ext-{next(_seq)}" if external_id == "auto" else external_id,
        dedupe_hash=compute_dedupe_hash(account.id, booking_date, value, "EUR", description),
        booking_date=booking_date,
        amount=value,
        currency=extra.pop("currency", "EUR"),
        amount_eur=value,
        description_raw=description,
        description_clean=description,
        raw=extra.pop("raw", {"provider": "mock", "id": "abc"}),
        **{"kind": "expense" if value < 0 else "income", **extra},
    )
    db.add(tx)
    db.commit()
    return tx


@pytest.fixture
def freeze_today(monkeypatch: pytest.MonkeyPatch) -> Callable[[date], None]:
    """Fissa la data di "oggi" (fuso di Roma) in tutti i moduli dell'app che la usano."""
    from app.services import dates

    replaced = {dates.today_rome}

    def freeze(day: date) -> None:
        def fake(now: object = None) -> date:
            return day

        for name, module in list(sys.modules.items()):
            if name.startswith("app.") and getattr(module, "today_rome", None) in replaced:
                monkeypatch.setattr(module, "today_rome", fake)
        replaced.add(fake)

    return freeze


@pytest.fixture(autouse=True)
def _no_real_trading212(
    monkeypatch: pytest.MonkeyPatch, tmp_path_factory: pytest.TempPathFactory
) -> None:
    """I test non usano MAI la chiave vera di Trading 212 (sta in DATA_DIR/secrets):
    il percorso delle credenziali punta a un file che non esiste."""
    from app.ingestion import trading212_setup
    from app.integrations import registry

    missing = tmp_path_factory.mktemp("no-secrets") / "trading212.env"
    monkeypatch.setattr(registry, "trading212_credentials_path", lambda: missing)
    monkeypatch.setattr(trading212_setup, "trading212_credentials_path", lambda: missing)


@pytest.fixture(autouse=True)
def _no_real_bank_secrets(
    monkeypatch: pytest.MonkeyPatch, tmp_path_factory: pytest.TempPathFactory
) -> None:
    """Né la chiave di cifratura vera (`app.key`) né le credenziali Enable Banking vere:
    la chiave di cifratura dei test sta in una cartella temporanea, le credenziali puntano
    a un file che non esiste."""
    from app.core import crypto
    from app.ingestion import enablebanking_setup

    folder = tmp_path_factory.mktemp("test-secrets")
    monkeypatch.setattr(crypto, "key_path", lambda: folder / "app.key")
    crypto.reset_cache()
    monkeypatch.setattr(
        enablebanking_setup, "credentials_path", lambda: folder / "enablebanking.env"
    )


@pytest.fixture(autouse=True)
def _no_ecb_download(monkeypatch: pytest.MonkeyPatch) -> None:
    """Nei test i cambi BCE non si scaricano mai: chi li vuole passa i suoi."""
    from app.ingestion import fx
    from app.integrations.ecb import EcbError

    def offline(since: object, today: object) -> NoReturn:
        raise EcbError("fx.ecb_unavailable", error="rete disattivata nei test")

    monkeypatch.setattr(fx, "fetch_rates", offline)


@pytest.fixture(autouse=True)
def _no_personal_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Il tuo nome e i tuoi posti (`OWNER_NAMES`, `HOME_PLACES` in backend/.env) non entrano
    nei test: chi li vuole li imposta da sé."""
    monkeypatch.setattr(get_settings(), "owner_names", [])
    monkeypatch.setattr(get_settings(), "home_places", [])
