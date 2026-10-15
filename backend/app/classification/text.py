"""Pulizia delle descrizioni bancarie e chiavi dei merchant (SPEC §11).

Due livelli:
- `clean_description`: testo leggibile da mostrare e cercare (senza numeri di carta,
  date, orari e prefissi tipo `PAGAMENTO POS`);
- `match_text` / `merchant_key`: forma normalizzata (minuscole, solo lettere e cifre)
  usata per riconoscere lo stesso merchant scritto in modi diversi.
"""

from __future__ import annotations

import re
import unicodedata

_WS = re.compile(r"\s+")

# Rumore che non identifica il merchant: carte mascherate, date, orari, riferimenti.
_NOISE = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\b(?:ACQUISTO\s+)?CARTA\s*(?:N\.?\s*)?[*X]+\s*\d{2,4}\b",
        r"[*X]{3,}\d{2,4}\b",
        r"\bDEL\s+\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b",
        r"\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b",
        r"\b(?:ORE\s+)?\d{1,2}[.:]\d{2}(?:[.:]\d{2})?\b",
    )
]

# Crédit Agricole: `POS CARTA CA DEBIT VISA N. ****1234 DEL ... C/O NEGOZIO CITTÀ PV ITA`.
# Il negozio è dopo "C/O" ("presso"): quello che precede è il tipo di carta.
_CARD_AT = re.compile(r"^.*?\bCARTA\b.*?\bC/O\s*", re.IGNORECASE)

# Prefissi tipici dei pagamenti con carta: si tolgono, il resto è il negozio.
_CARD_PREFIXES = re.compile(
    r"^(?:PAGAMENTO\s+(?:POS|CONTACTLESS|CARTA|ONLINE)|PAG\.?\s*POS|POS|"
    r"OPERAZIONE\s+CARTA|ACQUISTO(?:\s+POS)?)\b[\s:.-]*",
    re.IGNORECASE,
)

# Prefissi di addebiti e bonifici: utili per la chiave del merchant, non per la lettura.
_TRANSFER_PREFIXES = re.compile(
    r"^(?:ADDEBITO\s+(?:SEPA\s+DD|DIRETTO(?:\s+SDD)?|SDD|SEPA)|"
    r"BONIFICO\s+(?:SEPA\s+)?(?:A\s+VOSTRO\s+FAVORE\s+DA|A\s+FAVORE\s+DI|DA|A|ISTANTANEO\s+DA)|"
    r"GIROCONTO\s+(?:A\s+FAVORE\s+DI|DA|A)|PAGOPA|REFUND\s+FROM|RIMBORSO\s+DA|STORNO)\b"
    r"[\s:.-]*",
    re.IGNORECASE,
)
_CAUSALE = re.compile(r"\b(?:CAUS(?:ALE)?|RIF)\b.*$", re.IGNORECASE)

# Sigle delle province: i POS le mettono dopo la città ("BUSSOLENGO VR ITA").
_PROVINCES = [
    "ag",
    "al",
    "an",
    "ao",
    "ar",
    "ap",
    "at",
    "av",
    "ba",
    "bt",
    "bl",
    "bn",
    "bg",
    "bi",
    "bo",
    "bz",
    "bs",
    "br",
    "ca",
    "cl",
    "cb",
    "ce",
    "ct",
    "cz",
    "ch",
    "co",
    "cs",
    "cr",
    "kr",
    "cn",
    "en",
    "fm",
    "fe",
    "fi",
    "fg",
    "fc",
    "fr",
    "ge",
    "go",
    "gr",
    "im",
    "is",
    "sp",
    "aq",
    "lt",
    "le",
    "lc",
    "li",
    "lo",
    "lu",
    "mc",
    "mn",
    "ms",
    "mt",
    "me",
    "mi",
    "mo",
    "mb",
    "na",
    "no",
    "nu",
    "or",
    "pd",
    "pa",
    "pr",
    "pv",
    "pg",
    "pu",
    "pe",
    "pc",
    "pi",
    "pt",
    "pn",
    "pz",
    "po",
    "rg",
    "ra",
    "rc",
    "re",
    "ri",
    "rn",
    "rm",
    "ro",
    "sa",
    "ss",
    "sv",
    "si",
    "sr",
    "so",
    "su",
    "ta",
    "te",
    "tr",
    "to",
    "tp",
    "tn",
    "tv",
    "ts",
    "ud",
    "va",
    "ve",
    "vb",
    "vc",
    "vr",
    "vv",
    "vi",
    "vt",
]

# Parole finali da ignorare nella chiave: città, paesi, forme societarie.
_TRAILING_NOISE = frozenset(
    [
        "milano",
        "roma",
        "torino",
        "napoli",
        "bologna",
        "firenze",
        "genova",
        "venezia",
        "verona",
        "padova",
        "bergamo",
        "brescia",
        "monza",
        "pavia",
        "como",
        "varese",
        "parma",
        "modena",
        "bari",
        "palermo",
        "catania",
        "cagliari",
        "trieste",
        "trento",
        "london",
        "londra",
        "dublin",
        "dublino",
        "paris",
        "parigi",
        "amsterdam",
        "luxembourg",
        "lussemburgo",
        "vilnius",
        "it",
        "ita",
        "itl",
        "italia",
        "italy",
        "ie",
        "gb",
        "uk",
        "lt",
        "nl",
        "lu",
        "fr",
        "de",
        "es",
        "spa",
        "s",
        "p",
        "a",
        "srl",
        "s",
        "r",
        "l",
        "srls",
        "sas",
        "snc",
        "ltd",
        "limited",
        "uab",
        "inc",
        "llc",
        "gmbh",
        "bv",
        "b",
        "v",
        "plc",
        "sa",
        "ag",
        "co",
        "ltu",
        "lux",
        "irl",
        "gbr",
        "deu",
        "fra",
        "esp",
        "nld",
        "cze",
        *_PROVINCES,
    ]
)
_STOPWORDS = frozenset({"di", "da", "del", "della", "the", "and", "e", "of"})
_MAX_KEY_TOKENS = 4


def collapse_whitespace(text: str) -> str:
    return _WS.sub(" ", text).strip()


def clean_description(raw: str) -> str:
    """Descrizione leggibile: es. `PAGAMENTO POS ESSELUNGA MILANO CARTA *4821 DEL 01/02/26`
    → `ESSELUNGA MILANO`."""
    text = collapse_whitespace(raw)
    for pattern in _NOISE:
        text = pattern.sub(" ", text)
    text = _CARD_AT.sub("", collapse_whitespace(text))
    text = _CARD_PREFIXES.sub("", collapse_whitespace(text))
    text = collapse_whitespace(text).strip(" -:.,")
    return text or collapse_whitespace(raw)


def _ascii_fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def match_text(text: str) -> str:
    """Forma per i confronti: minuscole, senza accenti, solo lettere e cifre separate da spazi."""
    folded = _ascii_fold(text).casefold()
    return collapse_whitespace(re.sub(r"[^a-z0-9]+", " ", folded))


def contains_phrase(haystack: str, needle: str) -> bool:
    """Vero se `needle` compare in `haystack` come sequenza di parole intere (testi già
    normalizzati con `match_text`)."""
    return bool(needle) and f" {needle} " in f" {haystack} "


def merchant_source_text(description_raw: str, counterparty_name: str | None) -> str:
    """Il testo che descrive il merchant: la controparte se c'è, altrimenti la descrizione
    ripulita da prefissi, causale e riferimenti."""
    if counterparty_name and counterparty_name.strip():
        return counterparty_name
    text = clean_description(description_raw)
    text = _TRANSFER_PREFIXES.sub("", text)
    return collapse_whitespace(_CAUSALE.sub("", text))


def _key_tokens(text: str) -> list[str]:
    tokens = [t for t in match_text(text).split() if not t.isdigit()]
    while tokens and tokens[-1] in _TRAILING_NOISE:
        tokens.pop()
    # Le forme societarie in mezzo ("ACME S.R.L. MILANO") spariscono anche loro.
    tokens = [t for t in tokens if t not in {"spa", "srl", "srls", "ltd", "uab", "gmbh"}]
    tokens = tokens[:_MAX_KEY_TOKENS]
    while tokens and tokens[-1] in _TRAILING_NOISE | _STOPWORDS:
        tokens.pop()
    return tokens


def merchant_key(text: str) -> str | None:
    """Chiave normalizzata, es. `BAR MAGENTA MILANO` → `bar-magenta`."""
    tokens = _key_tokens(text)
    return "-".join(tokens) if tokens else None


def merchant_display_name(text: str) -> str:
    """Nome leggibile per un merchant creato in automatico (`bar-magenta` → `Bar Magenta`)."""
    tokens = _key_tokens(text)
    return " ".join(t.capitalize() for t in tokens)
