import { describe, expect, it } from "vitest";

import { budgetStatusText, shiftMonth } from "./month";

describe("shiftMonth", () => {
  it("attraversa gli anni in entrambe le direzioni", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-09", -12)).toBe("2025-09");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });
});

describe("budgetStatusText", () => {
  const base = { alert_threshold_pct: 80, remaining_eur: "30.00", projected_over: false };
  it("descrive ogni livello a parole", () => {
    expect(budgetStatusText({ ...base, level: "ok" })).toBe("In linea");
    expect(budgetStatusText({ ...base, level: "ok", projected_over: true })).toBe(
      "A questo ritmo lo superi",
    );
    expect(budgetStatusText({ ...base, level: "warning" })).toBe("Soglia di avviso superata (80%)");
    expect(budgetStatusText({ ...base, level: "over", remaining_eur: "0.00" })).toBe(
      "Budget esaurito",
    );
    expect(budgetStatusText({ ...base, level: "over", remaining_eur: "-12.00" })).toBe(
      "Budget superato",
    );
  });
});
