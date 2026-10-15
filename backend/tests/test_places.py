from __future__ import annotations

from app.classification.places import (
    card_location,
    home_keys,
    is_away,
    is_owner,
    is_paypal_to_owner,
    owner_keys,
)

POS = "POS CARTA CA DEBIT VISA N. ****1234 DEL 01/10/26 ORE 12:30 C/O "
HOMES = home_keys(["Verona", "Bussolengo", "Castelfranco Veneto", "Bergamo"])


def test_card_location_reads_shop_city_and_country() -> None:
    loc = card_location(POS + "LA GELATERIA BUSSOLENGO VR ITA")
    assert loc is not None
    assert (loc.text, loc.country, loc.online) == ("LA GELATERIA BUSSOLENGO VR", "ITA", False)
    assert card_location("Apple Pay Top-Up by *1234") is None


def test_away_from_home() -> None:
    def away(rest: str) -> bool:
        loc = card_location(POS + rest)
        assert loc is not None
        return is_away(loc, HOMES)

    assert not away("LA GELATERIA BUSSOLENGO VR ITA")
    assert not away("CAFFE DEL CORSO BERGAMO ITA")
    # I POS tagliano i nomi: "CASTELFRANCO VENETV" è Castelfranco Veneto (TV).
    assert not away("MCDONALD'S CASTELFR CASTELFRANCO VENETV ITA")
    assert away("BAR CIARDI ROMA RM ITA")
    assert away("Headout Castel Sant Rome DEU")
    # Online: la città è la sede legale, non dove eri.
    assert not away("Amazon.it www.amazon.it LUX")
    assert not away("RIDEMOVI.COM +391234567890 ITA")
    # Senza i tuoi posti la regola è spenta.
    loc = card_location(POS + "BAR CIARDI ROMA RM ITA")
    assert loc is not None
    assert not is_away(loc, [])


def test_owner_in_any_order() -> None:
    owners = owner_keys(["Mario Rossi"])
    assert is_owner("ROSSI MARIO", owners)
    assert is_owner("Mario Rossi", owners)
    assert not is_owner("Mario Bianchi", owners)
    assert not is_owner("Mario Rossi", [])
    assert is_paypal_to_owner("Paypal*rossi Mario", owners)
    assert not is_paypal_to_owner("Paypal *steam Games", owners)
