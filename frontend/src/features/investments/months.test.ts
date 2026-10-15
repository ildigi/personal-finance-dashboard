import { describe, expect, it } from "vitest";

import { fillMonths } from "./months";
import type { InvestmentMonth } from "./queries";

const month = (key: string, net: string, value: string | null = null): InvestmentMonth => ({
  month: key,
  deposits_eur: "0.00",
  withdrawals_eur: "0.00",
  dividends_eur: "0.00",
  interest_eur: "0.00",
  bought_eur: "0.00",
  sold_eur: "0.00",
  net_deposited_eur: net,
  value_eur: value,
});

describe("fillMonths", () => {
  it("riempie i mesi vuoti ripetendo il capitale versato", () => {
    const filled = fillMonths(
      [month("2025-11", "100.00"), month("2026-02", "300.00", "320.00")],
      "2026-03",
    );
    expect(filled.map((m) => [m.month, m.net_deposited_eur, m.value_eur])).toEqual([
      ["2025-11", "100.00", null],
      ["2025-12", "100.00", null],
      ["2026-01", "100.00", null],
      ["2026-02", "300.00", "320.00"],
      ["2026-03", "300.00", null],
    ]);
  });

  it("senza dati restituisce una serie vuota", () => {
    expect(fillMonths([], "2026-03")).toEqual([]);
  });
});
