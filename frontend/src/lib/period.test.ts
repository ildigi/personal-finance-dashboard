import { describe, expect, it } from "vitest";

import { formatRange, isPeriodPreset, resolvePeriod, todayInRome } from "./period";

describe("resolvePeriod", () => {
  const today = "2026-10-05";

  it.each([
    ["this_month", "2026-10-01", "2026-10-05"],
    ["last_month", "2026-09-01", "2026-09-30"],
    ["last_3_months", "2026-08-01", "2026-10-05"],
    ["last_6_months", "2026-05-01", "2026-10-05"],
    ["last_12_months", "2025-11-01", "2026-10-05"],
    ["year_to_date", "2026-01-01", "2026-10-05"],
  ] as const)("%s", (preset, from, to) => {
    expect(resolvePeriod(preset, today)).toEqual({ from, to });
  });

  it("gestisce il cambio d'anno e i mesi corti", () => {
    expect(resolvePeriod("last_month", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(resolvePeriod("last_month", "2028-03-10")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
    expect(resolvePeriod("last_3_months", "2026-02-01").from).toBe("2025-12-01");
  });
});

describe("todayInRome", () => {
  it("usa il fuso di Roma, non quello del dispositivo", () => {
    // 23:30 UTC del 31 dicembre è già 1° gennaio a Roma.
    expect(todayInRome(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(todayInRome(new Date("2026-06-30T21:59:00Z"))).toBe("2026-06-30");
  });
});

describe("formatRange", () => {
  it("compatta gli intervalli nello stesso mese o anno", () => {
    expect(formatRange({ from: "2026-10-01", to: "2026-10-05" })).toBe("1–5 ott 2026");
    expect(formatRange({ from: "2026-08-01", to: "2026-10-05" })).toBe("1 ago – 5 ott 2026");
    expect(formatRange({ from: "2025-11-01", to: "2026-10-05" })).toBe("1 nov 2025 – 5 ott 2026");
    expect(formatRange({ from: "2026-10-05", to: "2026-10-05" })).toBe("5 ott 2026");
  });
});

describe("isPeriodPreset", () => {
  it("riconosce solo i preset validi", () => {
    expect(isPeriodPreset("last_month")).toBe(true);
    expect(isPeriodPreset("forever")).toBe(false);
    expect(isPeriodPreset(null)).toBe(false);
  });
});
