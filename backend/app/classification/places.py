"""Dove è stato fatto un pagamento con carta e chi è la controparte (SPEC §11).

- `card_location`: città e paese dalle causali dei POS (Crédit Agricole:
  `... C/O NEGOZIO CITTÀ PV ITA`). Revolut non li manda: per i suoi pagamenti non c'è.
- `is_away`: il pagamento è fuori dai tuoi posti (`HOME_PLACES`)? Serve a mandare in
  Viaggi le spese fatte altrove.
- `is_owner`: la controparte sei tu (`OWNER_NAMES`), in qualunque ordine di nome e cognome.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.classification.text import match_text

_LOCATION = re.compile(r"\bC/O\s*(?P<text>.+?)\s+(?P<country>[A-Z]{3})\s*$", re.IGNORECASE)
# Negozi online: la "città" è la sede legale, non dove eri.
_ONLINE = re.compile(r"www\.|\.(?:com|it|eu|net|org|co\.uk)\b|\+\d{6,}|\d{8,}", re.IGNORECASE)
_PAYPAL_TO = re.compile(r"\bpaypal\s*\*\s*(?P<name>[^*]+)$", re.IGNORECASE)


@dataclass(frozen=True)
class CardLocation:
    text: str  # negozio + città, es. "LA GELATERIA BUSSOLENGO VR"
    country: str  # sigla a 3 lettere, es. "ITA"
    online: bool


def card_location(description_raw: str) -> CardLocation | None:
    match = _LOCATION.search(description_raw.strip())
    if match is None:
        return None
    text = match["text"].strip()
    return CardLocation(
        text=text, country=match["country"].upper(), online=bool(_ONLINE.search(text))
    )


def _compact(text: str) -> str:
    return match_text(text).replace(" ", "")


def home_keys(places: list[str]) -> list[str]:
    """Forme compatte dei tuoi posti; senza l'ultima lettera perché i POS tagliano i nomi
    ("CASTELFRANCO VENETV" per Castelfranco Veneto TV)."""
    keys = []
    for place in places:
        compact = _compact(place)
        if len(compact) >= 4:
            keys.append(compact[:-1] if len(compact) > 5 else compact)
    return keys


def is_away(location: CardLocation, homes: list[str]) -> bool:
    """Fuori casa: all'estero, o in Italia senza nessuno dei tuoi posti nella causale."""
    if not homes or location.online:
        return False
    if location.country != "ITA":
        return True
    text = _compact(location.text)
    return not any(home in text for home in homes)


def owner_keys(names: list[str]) -> list[frozenset[str]]:
    return [frozenset(match_text(n).split()) for n in names if match_text(n)]


def is_owner(name: str | None, owners: list[frozenset[str]]) -> bool:
    """La stessa persona anche con nome e cognome invertiti ("Rossi Mario" = "Mario Rossi")."""
    if not name or not owners:
        return False
    tokens = frozenset(match_text(name).split())
    return tokens in owners


def is_paypal_to_owner(description_raw: str, owners: list[frozenset[str]]) -> bool:
    """`PAYPAL*ROSSI MARIO`: soldi tra il tuo PayPal e un tuo conto."""
    match = _PAYPAL_TO.search(description_raw.strip())
    return match is not None and is_owner(match["name"], owners)
