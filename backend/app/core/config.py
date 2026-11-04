"""Configurazione dell'applicazione.

Tutto arriva da variabili d'ambiente o da `backend/.env` (mai versionato).
Database: `DATABASE_URL` (e `TEST_DATABASE_URL` per i test) se impostate, altrimenti
le credenziali del file indicato da `DB_ENV_FILE` (default `${DATA_DIR}/secrets/db.env`).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from dotenv import dotenv_values
from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["local", "production", "test"] = "local"
    # Cartella dei dati (segreti, backup, log), fuori da Git: default `data/` nella radice.
    data_dir: Path = BACKEND_DIR.parent / "data"
    # Modalità demo: all'avvio migrazioni, seed e dati di prova inventati (vedi app/demo.py).
    # Con i propri conti: DEMO_MODE=false.
    demo_mode: bool = True
    # Lingua dei dati iniziali (categorie, regole, demo) di un'installazione NUOVA: vale solo
    # su un database vuoto e resta salvata nel database (ADR 0006). Un database già popolato
    # senza lingua salvata resta in italiano.
    seed_locale: Literal["en", "it"] = "en"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["https://localhost:5173", "http://localhost:5173"]
    )
    # Valori ammessi nell'header Host (protezione dal DNS rebinding).
    allowed_hosts: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["127.0.0.1", "localhost"]
    )
    app_timezone: str = "Europe/Rome"
    auth_enabled: bool = False
    # Cookie di sessione solo su HTTPS (sempre vero, anche in locale con mkcert e sul
    # server dietro Tailscale); falso solo nei test con client http.
    auth_cookie_secure: bool = True
    # Il tuo nome come compare nelle causali dei giroconti: indizio di trasferimento interno.
    owner_names: Annotated[list[str], NoDecode] = Field(default_factory=list)
    # I posti dove vivi e studi: un pagamento con carta altrove (la città è nella causale)
    # finisce in Viaggi. Vuoto = regola spenta.
    home_places: Annotated[list[str], NoDecode] = Field(default_factory=list)

    db_env_file: Path | None = None
    database_url: SecretStr | None = None
    test_database_url: SecretStr | None = None

    # Sincronizzazione automatica di Trading 212 mentre il backend è acceso; 0 = spenta.
    # Nei test è sempre spenta.
    t212_auto_sync_minutes: int = Field(default=10, ge=0)
    # Banche (Enable Banking): dove la banca rimanda dopo il consenso (deve coincidere con
    # quello registrato nel Control Panel) e ogni quante ore sincronizzare da sole.
    # Senza utente presente le banche concedono al massimo 4 letture al giorno: minimo 6 ore.
    eb_redirect_url: str = "https://localhost:5173/impostazioni/ritorno-banca"
    eb_auto_sync_hours: int = Field(default=6, ge=0)

    @field_validator("eb_auto_sync_hours")
    @classmethod
    def _at_most_four_per_day(cls, value: int) -> int:
        if 0 < value < 6:
            raise ValueError("EB_AUTO_SYNC_HOURS: almeno 6 (massimo 4 letture al giorno) o 0")
        return value

    # Backup cifrati: ogni quante ore (0 = spenti), quanti tenerne, dove provarne il ripristino
    # (database che si può svuotare: nome che finisce con _test o _restore).
    backup_hours: int = Field(default=24, ge=0)
    backup_keep: int = Field(default=30, ge=1)
    backup_verify_db: str = "finance_test"
    # Frontend compilato da servire (sul server; in locale lo serve Vite).
    static_dir: Path | None = None
    # Cartella di pg_dump/pg_restore se non sono nel PATH.
    pg_bin_dir: Path | None = None

    log_level: str = "INFO"
    seeds_dir: Path = BACKEND_DIR.parent / "database" / "seeds"

    @field_validator("cors_origins", "allowed_hosts", "owner_names", "home_places", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def secrets_dir(self) -> Path:
        return self.data_dir / "secrets"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def resolved_db_env_file(self) -> Path:
        return self.db_env_file or self.secrets_dir / "db.env"

    def db_url(self, *, test: bool = False) -> URL:
        """URL SQLAlchemy del database applicativo o di quello dei test."""
        if self.database_url is not None and not test:
            return make_url(self.database_url.get_secret_value())
        if self.test_database_url is not None and test:
            return make_url(self.test_database_url.get_secret_value())

        path = self.resolved_db_env_file
        if not path.is_file():
            raise RuntimeError(f"File delle credenziali del database non trovato: {path}")
        values = dotenv_values(path)

        def required(key: str) -> str:
            value = values.get(key)
            if not value:
                raise RuntimeError(f"Variabile {key} mancante in {path}")
            return value

        return URL.create(
            "postgresql+psycopg",
            username=required("DB_USER"),
            password=required("DB_PASSWORD"),
            host=values.get("DB_HOST") or "127.0.0.1",
            port=int(values.get("DB_PORT") or 5432),
            database=required("DB_NAME_TEST" if test else "DB_NAME"),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
