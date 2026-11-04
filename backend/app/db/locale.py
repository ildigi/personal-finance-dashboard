"""Lingua dei dati dell'installazione (ADR 0006, fase I4).

Il seed scrive categorie, regole e dati di prova in una lingua sola, scelta una volta:
- se il database ha la lingua salvata (`app_settings.data_locale`), vale quella;
- se è già popolato senza lingua salvata (installazioni nate prima della I4), vale `it`
  per sempre, qualunque sia `SEED_LOCALE`: un database esistente non si tocca;
- se è vuoto, vale `SEED_LOCALE`, che il seed poi salva.
"""

from __future__ import annotations

from typing import Literal, get_args

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AppSetting, Category

DataLocale = Literal["en", "it"]
DATA_LOCALES: tuple[DataLocale, ...] = get_args(DataLocale)
DATA_LOCALE_KEY = "data_locale"
LEGACY_LOCALE: DataLocale = "it"


def stored_locale(session: Session) -> DataLocale | None:
    value = session.scalar(select(AppSetting.value).where(AppSetting.key == DATA_LOCALE_KEY))
    for locale in DATA_LOCALES:
        if value == locale:
            return locale
    return None


def is_empty(session: Session) -> bool:
    return not session.scalar(select(exists().where(Category.id.is_not(None))))


def data_locale(session: Session) -> DataLocale:
    stored = stored_locale(session)
    if stored is not None:
        return stored
    if not is_empty(session):
        return LEGACY_LOCALE
    return get_settings().seed_locale


def save_locale(session: Session, locale: DataLocale) -> None:
    setting = session.get(AppSetting, DATA_LOCALE_KEY)
    if setting is None:
        session.add(AppSetting(key=DATA_LOCALE_KEY, value=locale))
    else:
        setting.value = locale
    session.flush()
