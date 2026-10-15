import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Schemas } from "@/api/client";
import { investmentScopeStore } from "@/lib/preferences";

import { json, mockBackend, renderApp, type Handler } from "./helpers";

const PORTFOLIO: Schemas["PortfolioRead"] = {
  id: 2,
  name: "Trading 212 Invest",
  institution: "Trading 212",
  is_mock: false,
  source_id: 5,
  last_sync_at: "2026-10-05T12:00:00Z",
  tracking_start: null,
};

const SUMMARY: Schemas["InvestmentSummary"] = {
  portfolio: PORTFOLIO,
  as_of: "2026-10-05T12:00:00Z",
  value_eur: "1210.50",
  positions_value_eur: "1202.00",
  positions_cost_eur: "1100.00",
  cash_eur: "8.50",
  opening_balance_eur: "0.00",
  deposits_eur: "1100.00",
  withdrawals_eur: "50.00",
  net_deposited_eur: "1050.00",
  returns: {
    total_pl_eur: "160.50",
    simple_pct: 15.29,
    mwr_annual_pct: null,
    average_invested_eur: "300.00",
    days: 401,
  },
  active: { value_eur: "1202.00", cost_eur: "1100.00", pl_eur: "102.00", pct: 9.27 },
  breakdown: {
    unrealized_eur: "102.00",
    realized_eur: "12.40",
    dividends_eur: "4.00",
    interest_eur: "0.40",
    fees_eur: "0.15",
    other_eur: "41.85",
  },
  dividends_12m_eur: "4.00",
  dividend_yield_on_cost_pct: 0.36,
  positions: [
    {
      ticker: "VWCEd_EQ",
      name: "Vanguard FTSE All-World",
      isin: "IE00VWCE0000",
      quantity: "6.5",
      avg_price: "123.07",
      current_price: "140.00",
      instrument_currency: "EUR",
      cost_eur: "800.00",
      value_eur: "910.00",
      pl_eur: "110.00",
      pl_pct: 13.75,
      weight_pct: 75.7,
      pie_name: "ETF",
    },
  ],
  pies: [
    {
      id: 1,
      name: "ETF",
      cash_eur: "3.25",
      invested_eur: "800.00",
      value_eur: "910.00",
      result_eur: "110.00",
      result_pct: 13.75,
      goal_eur: null,
      dividend_action: "REINVEST",
      instruments: [
        {
          ticker: "VWCEd_EQ",
          name: "Vanguard FTSE All-World",
          expected_share_pct: 100,
          current_share_pct: 100,
          value_eur: "910.00",
          result_eur: "110.00",
        },
      ],
    },
  ],
};

const ACTIVITY: Schemas["InvestmentActivity"] = {
  orders: [],
  dividends: [],
  cash_flows: [],
  months: [],
};

const LIVE: Schemas["LiveRefresh"] = {
  refreshed: false,
  as_of: "2026-10-05T12:00:00Z",
  message: null,
};

function backend(overrides: Record<string, Handler> = {}) {
  return mockBackend({
    "/api/investments/portfolios": () => json([PORTFOLIO]),
    "/api/investments/2/summary": () => json(SUMMARY),
    "/api/investments/2/activity": () => json(ACTIVITY),
    "POST /api/investments/2/live": () => json(LIVE),
    ...overrides,
  });
}

const calls = (fetchMock: ReturnType<typeof mockBackend>, method: string, path: string) =>
  fetchMock.mock.calls
    .map(([request]) => request as Request)
    .filter((r) => r.method === method && new URL(r.url).pathname === path);

describe("Investimenti", () => {
  afterEach(() => {
    investmentScopeStore.set("all");
  });

  it("mostra il rendimento sul capitale versato e nasconde l'annuo non affidabile", async () => {
    backend();
    await renderApp("/investimenti");
    const value = await screen.findByText(/^\+15,3\s?%$/);
    const tile = value.closest<HTMLElement>("[data-slot=card]");
    if (!tile) throw new Error("tessera non trovata");
    expect(within(tile).getByText("Rendimento")).toBeInTheDocument();
    expect(within(tile).getByText("sul capitale versato, non annualizzato")).toBeInTheDocument();
    expect(screen.queryByText(/annuo/)).not.toBeInTheDocument();
    expect(screen.getByText("Pie «ETF»")).toBeInTheDocument();
    expect(screen.getByText("Dividendi reinvestiti nella Pie")).toBeInTheDocument();
    // Capitale versato riconciliato con la base della Pie dell'app.
    const note = screen.getByText(/base della Pie/);
    expect(note).toHaveTextContent(/base della Pie 800,00\s?€ · \+12,40\s?€ nei ribilanciamenti/);
  });

  it("«Solo attivi» mostra solo le posizioni in mano, come la Pie", async () => {
    backend();
    const { user } = await renderApp("/investimenti");
    await screen.findByText(/^\+15,3\s?%$/);
    await user.click(screen.getByRole("radio", { name: "Solo attivi" }));
    expect(screen.getByRole("radio", { name: "Solo attivi" })).toBeChecked();
    expect(screen.getByText("Costo posizioni")).toBeInTheDocument();
    const value = screen.getByText(/^\+9,3\s?%$/);
    const tile = value.closest<HTMLElement>("[data-slot=card]");
    if (!tile) throw new Error("tessera non trovata");
    expect(within(tile).getByText(/come la Pie nell'app/)).toBeInTheDocument();
    expect(screen.getByText("Guadagno sulle posizioni in mano")).toBeInTheDocument();
    expect(screen.queryByText("Realizzato dalle vendite")).not.toBeInTheDocument();
  });

  it("con la data di inizio il saldo di partenza conta come capitale versato", async () => {
    const started = { ...PORTFOLIO, tracking_start: "2026-08-17" };
    const fetchMock = backend({
      "/api/investments/portfolios": () => json([started]),
      "/api/investments/2/summary": () =>
        json({
          ...SUMMARY,
          portfolio: started,
          opening_balance_eur: "1051.90",
          deposits_eur: "0.00",
          withdrawals_eur: "0.00",
          net_deposited_eur: "1051.90",
        }),
      "PATCH /api/investments/2": () => json({ ...started, tracking_start: "2026-09-15" }),
    });
    const { user } = await renderApp("/investimenti");
    expect(await screen.findByRole("radio", { name: "Tutto (dal 17 ago)" })).toBeChecked();
    expect(await screen.findByText(/già sul conto il 17 ago/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "dal 17 ago 2026" }));
    const input = screen.getByLabelText("Data di inizio");
    await user.clear(input);
    await user.type(input, "2026-09-15");
    await user.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => {
      expect(calls(fetchMock, "PATCH", "/api/investments/2")).toHaveLength(1);
    });
    const [request] = calls(fetchMock, "PATCH", "/api/investments/2");
    expect(await request?.json()).toEqual({ tracking_start: "2026-09-15" });
    await waitFor(() => {
      expect(screen.queryByLabelText("Data di inizio")).not.toBeInTheDocument();
    });
  });

  it("aggiorna valore e posizioni in tempo reale e ricarica il riepilogo", async () => {
    // La risposta del broker arriva dopo il riepilogo (come nella realtà: 2 chiamate esterne).
    let release: () => void = () => undefined;
    const fetchMock = backend({
      "POST /api/investments/2/live": () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(json({ ...LIVE, refreshed: true }));
          };
        }),
    });
    await renderApp("/investimenti");
    await screen.findByText(/^\+15,3\s?%$/);
    await waitFor(() => {
      expect(calls(fetchMock, "POST", "/api/investments/2/live")).toHaveLength(1);
    });
    expect(calls(fetchMock, "GET", "/api/investments/2/summary")).toHaveLength(1);
    release();
    await waitFor(() => {
      expect(calls(fetchMock, "GET", "/api/investments/2/summary")).toHaveLength(2);
    });
    expect(await screen.findByText(/in tempo reale/)).toBeInTheDocument();
  });

  it("senza conti collegati rimanda alle impostazioni", async () => {
    mockBackend({ "/api/investments/portfolios": () => json([]) });
    await renderApp("/investimenti");
    expect(await screen.findByRole("link", { name: "Collega Trading 212" })).toHaveAttribute(
      "href",
      "/impostazioni",
    );
  });
});
