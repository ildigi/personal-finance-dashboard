import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/api/client";
import { frequencyLabel, perPeriodSuffix } from "@/features/recurring/labels";
import { formatDueDay } from "@/lib/format";

import { json, mockBackend, renderApp } from "./helpers";

const BUDGET: Schemas["BudgetStatus"] = {
  id: 4,
  category_id: 1,
  subcategory_id: null,
  name: "Trasporti",
  icon: "bus",
  color: null,
  amount: "100.00",
  alert_threshold_pct: 80,
  valid_from: "2026-09-01",
  spent_eur: "85.00",
  remaining_eur: "15.00",
  used_pct: 85,
  projected_eur: "140.00",
  projected_pct: 140,
  recurring_expected_eur: "22.00",
  level: "warning",
  projected_over: true,
  history: [
    { month: "2026-05", amount: null, spent_eur: "60.00" },
    { month: "2026-06", amount: null, spent_eur: "70.00" },
    { month: "2026-07", amount: null, spent_eur: "80.00" },
    { month: "2026-08", amount: null, spent_eur: "90.00" },
    { month: "2026-09", amount: "100.00", spent_eur: "120.00" },
    { month: "2026-10", amount: "100.00", spent_eur: "85.00" },
  ],
};

const OVERVIEW: Schemas["BudgetOverview"] = {
  month: "2026-10",
  date_from: "2026-10-01",
  date_to: "2026-10-31",
  is_current: true,
  days_elapsed: 5,
  days_in_month: 31,
  total_amount: "100.00",
  total_spent_eur: "85.00",
  total_projected_eur: "140.00",
  warning_count: 1,
  over_count: 0,
  items: [BUDGET],
};

const NETFLIX: Schemas["RecurringRead"] = {
  id: 9,
  name: "Netflix",
  status: "suggested",
  direction: "out",
  kind: "expense",
  merchant_id: 3,
  category_id: 1,
  subcategory_id: null,
  frequency: "monthly",
  interval_days: null,
  expected_amount: "6.99",
  amount_tolerance_pct: "10.00",
  monthly_eur: "6.99",
  next_expected_date: "2026-10-22",
  last_seen_date: "2026-09-22",
  confidence: 0.96,
  occurrences: 15,
  is_late: false,
};

const SUMMARY: Schemas["RecurringSummary"] = {
  expenses_monthly_eur: "0.00",
  subscriptions_monthly_eur: "0.00",
  income_monthly_eur: "0.00",
  invested_monthly_eur: "0.00",
  confirmed_count: 0,
  suggested_count: 1,
  late_count: 0,
};

describe("Budget", () => {
  it("mostra speso, soglia superata, proiezione e avvisi", async () => {
    mockBackend({
      "/api/budgets": () => json(OVERVIEW),
      "/api/recurring": () => json({ summary: SUMMARY, items: [] }),
    });
    await renderApp("/budget");

    const alerts = await screen.findByRole("list", { name: "Avvisi dei budget" });
    expect(within(alerts).getByText(/oltre il 80%/)).toBeInTheDocument();
    expect(screen.getByText("Soglia di avviso superata (80%)")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Speso del budget Trasporti" })).toHaveAttribute(
      "aria-valuenow",
      "85",
    );
    expect(screen.getByText(/stima a fine mese/)).toBeInTheDocument();
    expect(screen.getByText(/di addebiti ricorrenti attesi/)).toBeInTheDocument();
    // Storico: un mese sforato si riconosce anche senza colore.
    expect(
      screen.getByRole("button", { name: /settembre 2026: 120,00\s€ su 100,00\s€/ }),
    ).toBeInTheDocument();
    // Contatore nella barra laterale.
    expect(screen.getByText("1 budget oltre la soglia")).toBeInTheDocument();
  });

  it("crea un budget partendo dalla spesa media", async () => {
    const created: unknown[] = [];
    mockBackend({
      "/api/budgets": () => json({ ...OVERVIEW, items: [], warning_count: 0, total_amount: "0" }),
      "/api/recurring": () => json({ summary: SUMMARY, items: [] }),
      "/api/budgets/suggestion": () =>
        json({
          average_3m: "92.40",
          average_6m: "88.00",
          last_month: "120.00",
          current_month: "10.00",
        }),
      "POST /api/budgets": async (_url, request) => {
        created.push(await request.json());
        return json(BUDGET, 201);
      },
    });
    const { user } = await renderApp("/budget");
    await user.click(await screen.findByRole("button", { name: "Crea il primo budget" }));
    // Investimenti non è una categoria di spesa: non compare.
    await user.click(screen.getByRole("combobox", { name: "Categoria" }));
    expect(screen.queryByRole("option", { name: "Investimenti" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Trasporti" }));
    await user.click(await screen.findByRole("button", { name: /Media 3 mesi/ }));
    expect(screen.getByLabelText("Budget mensile (€)")).toHaveValue("93");
    await user.click(screen.getByRole("button", { name: "Crea budget" }));
    await waitFor(() => {
      expect(created).toEqual([
        { category_id: 1, subcategory_id: null, amount: "93.00", alert_threshold_pct: 80 },
      ]);
    });
  });
});

describe("Ricorrenze", () => {
  it("conferma una proposta", async () => {
    const patches: unknown[] = [];
    mockBackend({
      "/api/recurring": () => json({ summary: SUMMARY, items: [NETFLIX] }),
      "/api/recurring/upcoming": () => json([]),
      "/api/budgets": () => json({ ...OVERVIEW, items: [], warning_count: 0 }),
      "PATCH /api/recurring/9": async (_url, request) => {
        patches.push(await request.json());
        return json({ ...NETFLIX, status: "confirmed" });
      },
    });
    const { user } = await renderApp("/ricorrenze");
    expect(await screen.findByText("Da confermare", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText(/Ogni mese · 15 movimenti · Molto regolare/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Conferma Netflix" }));
    await waitFor(() => {
      expect(patches).toEqual([{ status: "confirmed" }]);
    });
  });
});

describe("Ricorrenze · eliminazione", () => {
  it("elimina del tutto una ricorrenza confermata senza movimenti", async () => {
    const deleted: URL[] = [];
    mockBackend({
      "/api/recurring": () =>
        json({
          summary: { ...SUMMARY, suggested_count: 0, confirmed_count: 1 },
          items: [{ ...NETFLIX, status: "confirmed", occurrences: 0 }],
        }),
      "/api/recurring/upcoming": () => json([]),
      "/api/budgets": () => json({ ...OVERVIEW, items: [], warning_count: 0 }),
      "DELETE /api/recurring/9": (url) => {
        deleted.push(url);
        return new Response(null, { status: 204 });
      },
    });
    const { user } = await renderApp("/ricorrenze");
    await user.click(await screen.findByRole("button", { name: "Altre azioni per Netflix" }));
    await user.click(await screen.findByRole("menuitem", { name: /Elimina/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/sparisce del tutto/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Elimina" }));
    await waitFor(() => {
      expect(deleted).toHaveLength(1);
    });
  });
});

describe("etichette", () => {
  it("descrive frequenze e scadenze", () => {
    expect(frequencyLabel("monthly", null)).toBe("Ogni mese");
    expect(frequencyLabel("custom", 14)).toBe("Ogni 2 settimane");
    expect(frequencyLabel("custom", 10)).toBe("Ogni 10 giorni");
    expect(perPeriodSuffix("yearly", null)).toBe("/anno");
    expect(formatDueDay("2026-10-05", "2026-10-05")).toBe("Oggi");
    expect(formatDueDay("2026-10-06", "2026-10-05")).toBe("Domani");
    expect(formatDueDay("2026-10-10", "2026-10-05")).toBe("sab 10 ott");
    expect(formatDueDay("2027-01-04", "2026-10-05")).toBe("lun 4 gen 2027");
  });
});
