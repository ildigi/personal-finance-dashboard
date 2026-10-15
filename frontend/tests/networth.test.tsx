import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/api/client";

import { json, mockBackend, renderApp } from "./helpers";

const point = (date: string, cash: string, inv: string, extra = {}) => ({
  date,
  cash_eur: cash,
  investments_eur: inv,
  total_eur: (Number(cash) + Number(inv)).toFixed(2),
  partial: false,
  estimated: false,
  ...extra,
});

const NETWORTH: Schemas["NetWorthOverview"] = {
  as_of: "2026-10-06",
  total_eur: "1500.00",
  cash_eur: "1000.00",
  investments_eur: "500.00",
  accounts: [
    {
      account_id: 1,
      name: "Conto corrente",
      institution: "Banca Test",
      type: "checking",
      kind: "cash",
      currency: "EUR",
      value_eur: "1000.00",
      as_of: "2026-10-06",
      share_pct: 66.7,
      history_from: "2026-09-01",
    },
    {
      account_id: 5,
      name: "Broker",
      institution: "Broker Test",
      type: "broker",
      kind: "investments",
      currency: "EUR",
      value_eur: "500.00",
      as_of: "2026-10-06",
      share_pct: 33.3,
      history_from: "2026-10-05",
    },
  ],
  series: [
    point("2026-10-03", "900.00", "450.00", { estimated: true }),
    point("2026-10-04", "950.00", "450.00", { estimated: true }),
    point("2026-10-05", "980.00", "490.00"),
    point("2026-10-06", "1000.00", "500.00"),
  ],
  changes: [
    {
      days: 30,
      from_date: "2026-09-06",
      delta_eur: null,
      delta_pct: null,
      cash_delta_eur: "120.00",
    },
  ],
  complete_from: "2026-10-05",
};

describe("Patrimonio netto", () => {
  it("mostra totale, quote, note sui dati mancanti e conti", async () => {
    mockBackend({ "/api/networth": () => json(NETWORTH) });
    await renderApp("/patrimonio");

    await screen.findByText("Per conto");
    const tile = screen
      .getAllByText("Patrimonio netto", { selector: "span" })
      .map((el) => el.closest("[data-slot=card]"))
      .find((el): el is HTMLElement => el instanceof HTMLElement);
    if (!tile) throw new Error("tessera del patrimonio non trovata");
    expect(within(tile).getByText(/1\.500,00/)).toBeInTheDocument();
    // Investimenti stimati: il confronto del totale non regge, quello della liquidità sì.
    expect(within(tile).getByText(/liquidità/)).toBeInTheDocument();
    expect(within(tile).getByText(/\+120,00/)).toBeInTheDocument();
    expect(screen.getByText("66,7% del patrimonio")).toBeInTheDocument();
    expect(screen.getByText(/Servono 12 mesi di dati completi/)).toBeInTheDocument();
    expect(screen.getByText(/Broker Test: valore reale dal/)).toBeInTheDocument();
    expect(screen.getByText("Conto corrente")).toBeInTheDocument();
    expect(screen.getByText(/Banca Test · liquidità · saldo al/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "6 mesi" })).toHaveAttribute("aria-checked", "true");
  });

  it("cambiando periodo chiede lo storico da una nuova data", async () => {
    const calls: (string | null)[] = [];
    mockBackend({
      "/api/networth": (url) => {
        calls.push(url.searchParams.get("since"));
        return json(NETWORTH);
      },
    });
    const { user } = await renderApp("/patrimonio");
    await screen.findByText("Per conto");
    await user.click(screen.getByRole("radio", { name: "Tutto" }));
    await waitFor(() => {
      expect(calls.at(-1)).toBeNull();
    });
    expect(calls[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Panoramica · da sistemare", () => {
  it("raccoglie consensi in scadenza, budget e ricorrenze", async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    mockBackend({
      "/api/networth": () => json(NETWORTH),
      "/api/sources": () =>
        json([
          {
            id: 7,
            provider: "enablebanking",
            institution: "Banca Test",
            display_name: "Banca Test",
            status: "active",
            consent_expires_at: soon,
            last_sync_at: null,
            created_at: "2026-10-01T00:00:00Z",
            updated_at: "2026-10-01T00:00:00Z",
          },
        ]),
      "/api/budgets": () =>
        json({
          month: "2026-10",
          date_from: "2026-10-01",
          date_to: "2026-10-31",
          is_current: true,
          days_elapsed: 6,
          days_in_month: 31,
          total_amount: "100.00",
          total_spent_eur: "120.00",
          total_projected_eur: "300.00",
          warning_count: 1,
          over_count: 1,
          items: [],
        }),
      "/api/recurring": () =>
        json({
          summary: {
            expenses_monthly_eur: "0.00",
            subscriptions_monthly_eur: "0.00",
            income_monthly_eur: "0.00",
            invested_monthly_eur: "0.00",
            confirmed_count: 1,
            suggested_count: 2,
            late_count: 0,
          },
          items: [],
        }),
    });
    await renderApp("/");
    const card = (await screen.findByText("Da sistemare")).closest("[data-slot=card]");
    if (!(card instanceof HTMLElement)) throw new Error("riquadro «Da sistemare» non trovato");
    expect(await within(card).findByText(/1 budget superato/)).toBeInTheDocument();
    expect(within(card).getByText(/Consenso di Banca Test in scadenza tra/)).toBeInTheDocument();
    expect(within(card).getByText("2 ricorrenze da confermare")).toBeInTheDocument();
    // I problemi prima degli avvisi.
    const items = within(card).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("budget superato");
  });
});
