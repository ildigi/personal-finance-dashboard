"""Rilevamento delle ricorrenze: funzioni pure, senza database."""

from __future__ import annotations

import random
from datetime import date, timedelta
from decimal import Decimal
from itertools import count

from app.models.enums import Frequency
from app.recurring.detection import Cadence, Occurrence, anchor_day, cadence_for, detect

_ids = count(1)


def occ(day: date, amount: str, key: str = "m:1", kind: str | None = None) -> Occurrence:
    value = Decimal(amount)
    return Occurrence(
        id=next(_ids),
        day=day,
        amount=value,
        kind=kind or ("expense" if value < 0 else "income"),
        match_key=key,
    )


def monthly(
    start: date, n: int, amount: str, key: str = "m:1", day: int | None = None
) -> list[Occurrence]:
    first = start.replace(day=1)
    items = []
    for i in range(n):
        month = date(first.year + (first.month - 1 + i) // 12, (first.month - 1 + i) % 12 + 1, 1)
        items.append(occ(month.replace(day=day or start.day), amount, key))
    return items


def test_monthly_subscription() -> None:
    [series] = detect(monthly(date(2025, 7, 22), 12, "-6.99"))
    assert series.cadence.frequency == Frequency.MONTHLY
    assert series.direction == "out"
    assert series.expected_amount == Decimal("6.99")
    assert series.last_seen == date(2026, 6, 22)
    assert series.next_expected == date(2026, 7, 22)
    assert series.occurrences == 12
    assert series.confidence > Decimal("0.9")


def test_payments_moved_to_the_previous_business_day_still_count() -> None:
    # Affitto il 1° del mese, anticipato al venerdì quando il 1° cade nel weekend.
    days = [date(2026, 1, 30), date(2026, 3, 2), date(2026, 4, 1), date(2026, 5, 1)]
    days += [date(2026, 5, 29), date(2026, 7, 1)]
    [series] = detect([occ(d, "-520.00") for d in days])
    assert series.cadence.frequency == Frequency.MONTHLY
    assert series.anchor_day == 1
    assert series.next_expected == date(2026, 8, 1)


def test_same_merchant_with_two_prices_gives_two_series() -> None:
    items = monthly(date(2025, 10, 8), 6, "-0.99") + monthly(date(2025, 10, 12), 6, "-10.99")
    found = sorted(detect(items), key=lambda s: s.expected_amount)
    assert [s.expected_amount for s in found] == [Decimal("0.99"), Decimal("10.99")]


def test_amount_within_ten_percent_is_the_same_series() -> None:
    # Abbonamento in dollari: il controvalore in euro cambia un po' ogni mese.
    amounts = ["-18.11", "-18.70", "-18.40", "-18.52", "-18.30"]
    items = [occ(date(2026, 1 + i, 18), a) for i, a in enumerate(amounts)]
    [series] = detect(items)
    assert series.expected_amount == Decimal("18.40")  # mediana degli ultimi tre


def test_price_increase_beyond_tolerance_splits_the_series() -> None:
    items = monthly(date(2025, 1, 5), 6, "-9.99") + monthly(date(2025, 7, 5), 4, "-12.99")
    found = sorted(detect(items), key=lambda s: s.expected_amount)
    assert [s.expected_amount for s in found] == [Decimal("9.99"), Decimal("12.99")]
    assert found[0].last_seen == date(2025, 6, 5)


def test_weekly_needs_four_occurrences() -> None:
    start = date(2026, 3, 2)
    three = [occ(start + timedelta(weeks=i), "-12.00") for i in range(3)]
    assert detect(three) == []
    [series] = detect([*three, occ(start + timedelta(weeks=3), "-12.00")])
    assert series.cadence.frequency == Frequency.WEEKLY


def test_biweekly_is_custom_14_days() -> None:
    start = date(2026, 3, 2)
    [series] = detect([occ(start + timedelta(days=14 * i), "-40.00") for i in range(5)])
    assert series.cadence == Cadence(Frequency.CUSTOM, 14)


def test_quarterly_and_yearly() -> None:
    quarterly = [occ(date(2025, m, 15), "-60.00", "m:q") for m in (1, 4, 7, 10)]
    yearly = [occ(date(2024, 11, 3), "-89.00", "m:y"), occ(date(2025, 11, 5), "-89.00", "m:y")]
    found = {s.match_key: s for s in detect(quarterly + yearly)}
    assert found["m:q"].cadence.frequency == Frequency.QUARTERLY
    assert found["m:y"].cadence.frequency == Frequency.YEARLY
    assert found["m:y"].next_expected == date(2026, 11, 5)


def test_two_occurrences_are_not_enough_for_monthly() -> None:
    assert detect(monthly(date(2026, 1, 10), 2, "-9.99")) == []


def test_a_missing_month_and_an_extra_purchase_are_tolerated() -> None:
    items = [i for i in monthly(date(2025, 9, 8), 10, "-0.99") if i.day.month != 1]
    extra = occ(date(2026, 3, 20), "-0.99")  # acquisto occasionale dello stesso importo
    [series] = detect([*items, extra])
    assert series.missed == 1
    assert series.extras == 1
    assert extra.id not in series.occurrence_ids
    assert series.cadence.frequency == Frequency.MONTHLY


def test_same_day_payments_collapse() -> None:
    # Dicembre: stipendio e tredicesima lo stesso giorno, dallo stesso ordinante.
    items = monthly(date(2025, 7, 27), 8, "1500.00", key="iban:IT00")
    bonus = occ(date(2025, 12, 27), "1500.00", key="iban:IT00")
    [series] = detect([*items, bonus])
    assert series.direction == "in"
    assert series.occurrences == 8
    assert bonus.id in series.occurrence_ids


def test_irregular_spending_is_not_recurring() -> None:
    rng = random.Random(42)  # noqa: S311  (dati finti)
    items = []
    day = date(2025, 1, 1)
    while day < date(2026, 1, 1):
        if day.weekday() in (1, 5) and rng.random() < 0.75:
            items.append(occ(day, f"-{rng.uniform(14, 78):.2f}", "m:spesa"))
        if day.weekday() < 5 and rng.random() < 0.5:
            items.append(occ(day, f"-{rng.choice([1.0, 1.2, 1.5, 2.0, 2.5]):.2f}", "m:caffe"))
        day += timedelta(days=1)
    assert detect(items) == []


def test_every_41_days_is_not_a_standard_cadence() -> None:
    items = [occ(date(2025, 1, 7) + timedelta(days=41 * i), "-18.00") for i in range(9)]
    assert detect(items) == []


def test_after_a_long_pause_only_the_restarted_series_counts() -> None:
    items = monthly(date(2025, 2, 3), 5, "-35.00") + monthly(date(2025, 10, 3), 3, "-35.00")
    [series] = detect(items)
    assert series.occurrences == 3
    assert series.occurrence_ids == [o.id for o in items[-3:]]


def test_is_active() -> None:
    [series] = detect(monthly(date(2025, 1, 10), 5, "-9.99"))
    assert series.is_active(date(2025, 6, 20))
    assert not series.is_active(date(2025, 8, 1))


def test_next_after_uses_the_nominal_date() -> None:
    monthly_cadence = cadence_for("monthly", None)
    # Pagato il 30 settembre per il 1° ottobre: il prossimo è il 1° novembre.
    assert monthly_cadence.next_after(date(2026, 9, 30), 1) == date(2026, 11, 1)
    assert monthly_cadence.next_after(date(2026, 10, 1), 1) == date(2026, 11, 1)
    assert monthly_cadence.next_after(date(2026, 1, 31), 31) == date(2026, 2, 28)
    assert cadence_for("custom", 10).next_after(date(2026, 1, 1)) == date(2026, 1, 11)


def test_end_of_month_anchor() -> None:
    days = [date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30)]
    assert anchor_day(days, cadence_for("monthly", None)) == 31
    assert anchor_day(days, cadence_for("weekly", None)) is None


def test_monthly_equivalents() -> None:
    assert cadence_for("monthly", None).per_month == 1
    assert cadence_for("yearly", None).per_month * 12 == 1
    assert round(cadence_for("weekly", None).per_month, 2) == Decimal("4.35")
