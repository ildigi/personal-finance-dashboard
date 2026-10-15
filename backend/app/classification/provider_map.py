"""Passo 6 della pipeline: categoria del provider o codice MCC → categoria (codici del seed).

L'MCC (Merchant Category Code, standard dei circuiti carte) è più preciso della
categoria del provider (es. 4112 = treno, mentre Revolut dice solo "transport"),
quindi viene valutato per primo.
"""

from __future__ import annotations

CategoryRef = tuple[str, str | None]  # (codice categoria, codice sottocategoria)

_MCC: dict[str, CategoryRef] = {
    # Spesa
    "5411": ("spesa", None),
    "5422": ("spesa", None),
    "5441": ("spesa", None),
    "5451": ("spesa", None),
    "5462": ("spesa", None),
    "5499": ("spesa", None),
    # Bar e ristoranti
    "5812": ("ristoranti", None),
    "5813": ("ristoranti", None),
    "5814": ("ristoranti", None),
    # Uscite (cinema, spettacoli)
    "7832": ("uscite", None),
    "7922": ("uscite", None),
    # Trasporti
    "4111": ("trasporti", "bus"),
    "4131": ("trasporti", "bus"),
    "4112": ("trasporti", "treno"),
    "4121": ("trasporti", None),
    "4789": ("trasporti", None),
    # Viaggi
    "4511": ("viaggi", "voli"),
    "4722": ("viaggi", None),
    "7011": ("viaggi", "alloggio"),
    # Vestiti
    "5621": ("vestiti", None),
    "5651": ("vestiti", None),
    "5661": ("vestiti", None),
    "5691": ("vestiti", None),
    "5699": ("vestiti", None),
    # Parrucchiere
    "7230": ("cura_persona", None),
    # Palestra
    "7997": ("sport", None),
    # Università
    "5942": ("istruzione", "libri"),
    "8220": ("istruzione", "tasse_corsi"),
    # Regali
    "5947": ("regali", None),
    "5992": ("regali", None),
    # Abbonamenti (telefonia, streaming)
    "4814": ("abbonamenti", "altri_servizi"),
    "4899": ("abbonamenti", "altri_servizi"),
}

# Compagnie aeree (3000-3299) e hotel (3501-3999) hanno MCC dedicati per marchio.
_MCC_RANGES: list[tuple[int, int, CategoryRef]] = [
    (3000, 3299, ("viaggi", "voli")),
    (3501, 3999, ("viaggi", "alloggio")),
]

# Categorie dei provider (Revolut e simili), in minuscolo.
_PROVIDER: dict[str, CategoryRef] = {
    "groceries": ("spesa", None),
    "restaurants": ("ristoranti", None),
    "entertainment": ("uscite", None),
    "transport": ("trasporti", None),
    "travel": ("viaggi", None),
    "clothing": ("vestiti", None),
}


def category_for_mcc(mcc: str | None) -> CategoryRef | None:
    if not mcc:
        return None
    if mcc in _MCC:
        return _MCC[mcc]
    if mcc.isdigit():
        code = int(mcc)
        for low, high, ref in _MCC_RANGES:
            if low <= code <= high:
                return ref
    return None


def category_for_provider(provider_category: str | None) -> CategoryRef | None:
    if not provider_category:
        return None
    return _PROVIDER.get(provider_category.strip().casefold())
