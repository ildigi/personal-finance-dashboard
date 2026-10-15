import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/api/client";
import { LearnPrompt } from "@/features/transactions/components/LearnPrompt";

import { json, mockBackend, renderApp } from "./helpers";

const EXPENSES: Schemas["ExpensesSummary"] = {
  period: { date_from: "2026-10-01", date_to: "2026-10-05" },
  previous_period: { date_from: "2026-09-01", date_to: "2026-09-05" },
  total_eur: "120.00",
  previous_total_eur: "100.00",
  delta_eur: "20.00",
  delta_pct: 20,
  count: 4,
  invested_eur: "200.00",
  previous_invested_eur: "0.00",
  averages: { m3: "900.00", m6: "950.00", m12: null },
  subscriptions_monthly_eur: "47.42",
  subscriptions_source: "average",
  unclassified_count: 2,
  categories: [
    {
      category_id: 1,
      name: "Trasporti",
      icon: "bus",
      color: null,
      total_eur: "120.00",
      previous_eur: "100.00",
      count: 4,
      share_pct: 100,
      subcategories: [{ subcategory_id: 2, name: "Treno", total_eur: "120.00", count: 4 }],
    },
  ],
};

const MONTHLY: Schemas["MonthlySeries"] = {
  months: [
    {
      month: "2026-09",
      expenses_eur: "100.00",
      income_eur: "1500.00",
      invested_eur: "200.00",
      net_eur: "1400.00",
      categories: [{ category_id: 1, total_eur: "100.00" }],
    },
  ],
};

const RULE: Schemas["RuleRead"] = {
  id: 7,
  code: null,
  name: "Netflix → Uscite",
  priority: 10,
  is_active: true,
  origin: "learned",
  conditions: { merchant_id: 3, direction: "out" },
  actions: { category_id: 1 },
  match_count: 12,
  last_matched_at: "2026-09-22T00:00:00Z",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  is_stale: false,
};

function tx(id: number, amount: string, accountId: number): Schemas["TransactionRead"] {
  return {
    id,
    account_id: accountId,
    external_id: `B-${String(id)}`,
    booking_date: "2026-10-02",
    value_date: null,
    status: "booked",
    amount,
    currency: "EUR",
    amount_eur: amount,
    original_amount: null,
    original_currency: null,
    fx_rate: null,
    description_raw: "BONIFICO",
    description_clean: "BONIFICO",
    counterparty_name: null,
    counterparty_iban: null,
    merchant_id: null,
    merchant_name: null,
    kind: amount.startsWith("-") ? "expense" : "income",
    category_id: null,
    subcategory_id: null,
    income_type_id: null,
    classification_source: "none",
    rule_id: null,
    classification_note: null,
    transfer_pair_id: null,
    recurring_id: null,
    refund_of_id: null,
    notes: null,
    is_manual: false,
    tags: [],
    created_at: "2026-10-02T10:00:00Z",
    updated_at: "2026-10-02T10:00:00Z",
  };
}

describe("Spese", () => {
  it("mostra spese reali, confronto, investito a parte e categorie", async () => {
    mockBackend({
      "/api/analytics/expenses": () => json(EXPENSES),
      "/api/analytics/monthly": () => json(MONTHLY),
      "/api/analytics/merchants": () => json([]),
    });
    await renderApp("/spese");
    expect(await screen.findByText("Spese reali")).toBeInTheDocument();
    expect(screen.getAllByText("120,00 €").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+20,00 €/).length).toBeGreaterThan(0);
    expect(screen.getByText("200,00 €")).toBeInTheDocument(); // spostati e investiti
    expect(screen.getByText("2 movimenti da classificare")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Trasporti/ }));
    const link = screen.getByRole("link", { name: /Treno/ });
    expect(link).toHaveAttribute("href", "/movimenti?categoria=1&sottocategoria=2");
  });
});

describe("Regole", () => {
  it("descrive le regole e conferma un trasferimento proposto", async () => {
    const pairs: unknown[] = [];
    mockBackend({
      "/api/rules": () => json([RULE]),
      "/api/classification/stats": () =>
        json({
          total: 100,
          auto_classified: 94,
          manual: 1,
          unclassified: 5,
          auto_pct: 94,
          by_source: {},
          active_rules: 1,
          stale_rules: 0,
          transfer_suggestions: 1,
        }),
      "/api/transfers/suggestions": () =>
        json([{ outflow: tx(10, "-50.00", 1), inflow: tx(11, "50.00", 2) }]),
      "/api/merchants": () =>
        json({
          items: [
            {
              id: 3,
              name: "Netflix",
              normalized_key: "netflix",
              aliases: [],
              default_category_id: null,
              default_subcategory_id: null,
              origin: "seed",
              transaction_count: 12,
              spent_eur: "83.88",
              last_date: "2026-09-22",
            },
          ],
          total: 1,
          limit: 500,
          offset: 0,
        }),
      "POST /api/transfers": async (_url, request) => {
        pairs.push(await request.json());
        return json([]);
      },
    });
    const { user } = await renderApp("/regole");

    const item = (await screen.findByText("Netflix → Uscite")).closest("li");
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).getByText(/merchant Netflix · uscite/)).toBeInTheDocument();
    expect(within(item as HTMLElement).getByRole("link", { name: "12 movimenti" })).toHaveAttribute(
      "href",
      "/movimenti?regola=7",
    );
    expect(screen.getByText("94,0%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sì, è un giroconto/ }));
    await waitFor(() => {
      expect(pairs).toEqual([{ out_id: 10, in_id: 11 }]);
    });
  });
});

describe("Apprendimento", () => {
  it("dopo una correzione propone la regola e la crea", async () => {
    const learned: unknown[] = [];
    mockBackend({
      "/api/transactions/5/learn": () =>
        json({
          transaction_id: 5,
          merchant_id: 3,
          subject: "OpenAI",
          rule_name: "OpenAI → Abbonamenti › AI",
          similar_count: 12,
          conditions: { merchant_id: 3, direction: "out" },
          actions: { category_id: 1, subcategory_id: 2 },
        }),
      "POST /api/transactions/5/learn": async (_url, request) => {
        learned.push(await request.json());
        return json({ updated: 12, rule: { ...RULE, name: "OpenAI → Abbonamenti › AI" } });
      },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LearnPrompt transactionId={5} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/12 passati, e quelli futuri/)).toBeInTheDocument();
    expect(screen.getByText("Abbonamenti › AI")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Crea regola per il futuro" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Regola creata: «OpenAI → Abbonamenti › AI». 12 movimenti aggiornati",
    );
    expect(learned).toEqual([{ scope: "rule" }]);
  });
});
