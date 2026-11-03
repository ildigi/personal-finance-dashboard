import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";

import type { Account, Category, Health } from "@/api/client";
import { AppProviders } from "@/app/providers";
import { routes } from "@/app/router";

// --- Backend simulato --------------------------------------------------------------------

export const HEALTH: Health = {
  status: "ok",
  version: "0.1.0",
  environment: "local",
  database: {
    ok: true,
    migration_current: "b9b2e18150b5",
    migration_head: "b9b2e18150b5",
    up_to_date: true,
  },
};

export const ACCOUNTS: Account[] = [
  {
    id: 1,
    source_id: 1,
    external_id: "ca-1",
    name: "Conto corrente CA",
    type: "checking",
    currency: "EUR",
    iban: "IT00X0000000000000000000000",
    institution: "Crédit Agricole Italia",
    is_active: true,
    include_in_net_worth: true,
    color: null,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    balance: "1234.56",
    balance_as_of: "2026-10-01",
    balance_type: "available",
  },
  {
    id: 2,
    source_id: 2,
    external_id: "rev-1",
    name: "Revolut EUR",
    type: "card",
    currency: "EUR",
    iban: null,
    institution: "Revolut",
    is_active: true,
    include_in_net_worth: true,
    color: null,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    balance: null,
    balance_as_of: null,
    balance_type: null,
  },
];

export const CATEGORIES: Category[] = [
  {
    id: 1,
    name: "Trasporti",
    code: "trasporti",
    kind: "expense",
    icon: "bus",
    color: null,
    sort_order: 10,
    is_system: false,
    excluded_from_spending: false,
    is_archived: false,
    subcategories: [
      { id: 1, category_id: 1, name: "Bus", code: "bus", sort_order: 10, is_archived: false },
      { id: 2, category_id: 1, name: "Treno", code: "treno", sort_order: 20, is_archived: false },
    ],
  },
  {
    id: 2,
    name: "Investimenti",
    code: "investimenti",
    kind: "investment",
    icon: "trending-up",
    color: null,
    sort_order: 20,
    is_system: true,
    excluded_from_spending: true,
    is_archived: false,
    subcategories: [],
  },
];

/** Handler per percorso ("/api/x") o per metodo e percorso ("POST /api/x"). */
export type Handler = (url: URL, request: Request) => Response | Promise<Response>;

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export function mockBackend(overrides: Record<string, Handler> = {}): ReturnType<typeof vi.fn> {
  const handlers: Record<string, Handler> = {
    "/api/health": () => json(HEALTH),
    "/api/accounts": () => json(ACCOUNTS),
    "/api/categories": () => json(CATEGORIES),
    "/api/transactions": () =>
      json({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
        totals: { count: 0, inflow_eur: "0", outflow_eur: "0" },
      }),
    "/api/income-types": () =>
      json([{ id: 1, code: "salary", label: "Stipendio", is_system: true }]),
    ...overrides,
  };
  const fetchMock = vi.fn((input: Request) => {
    const url = new URL(input.url);
    const handler = handlers[`${input.method} ${url.pathname}`] ?? handlers[url.pathname];
    return Promise.resolve(
      handler ? handler(url, input) : json({ detail: { code: "not_found", params: {} } }, 404),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Monta l'app e attende la shell (le pagine sono caricate in modo lazy). */
export async function renderApp(path = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  // Le pagine con i grafici (Recharts) si caricano su richiesta: sotto carico servono secondi.
  await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });
  return { router, user };
}

export const pageTitle = () => screen.getByRole("heading", { level: 1 });
