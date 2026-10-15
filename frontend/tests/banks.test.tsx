import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/api/client";

import { json, mockBackend, renderApp, type Handler } from "./helpers";

const STATUS: Schemas["BanksStatus"] = {
  credentials_found: true,
  environment: "sandbox",
  redirect_url: "http://localhost:5173/impostazioni/ritorno-banca",
};

const BANKS: Schemas["BankRead"][] = [
  {
    name: "Mock ASPSP",
    country: "IT",
    logo: null,
    psu_types: ["personal"],
    max_consent_days: 180,
    beta: false,
  },
  {
    name: "UniCredit",
    country: "IT",
    logo: null,
    psu_types: ["personal"],
    max_consent_days: 180,
    beta: false,
  },
];

function bankSource(overrides: Partial<Schemas["SourceRead"]> = {}): Schemas["SourceRead"] {
  return {
    id: 7,
    provider: "enablebanking",
    institution: "Mock ASPSP",
    display_name: "Mock ASPSP",
    status: "active",
    consent_expires_at: "2027-04-04T10:00:00Z",
    last_sync_at: "2026-10-06T08:00:00Z",
    created_at: "2026-10-06T08:00:00Z",
    updated_at: "2026-10-06T08:00:00Z",
    ...overrides,
  };
}

const calls = (fetchMock: ReturnType<typeof mockBackend>, method: string, path: string) =>
  fetchMock.mock.calls
    .map(([request]) => request as Request)
    .filter((r) => r.method === method && new URL(r.url).pathname === path);

function backend(overrides: Record<string, Handler> = {}) {
  return mockBackend({
    "/api/sources": () => json([]),
    "/api/sources/trading212/status": () => json({ credentials_found: false, source_id: null }),
    "/api/banks/status": () => json(STATUS),
    "/api/banks/aspsps": () => json(BANKS),
    "POST /api/banks/authorize": () =>
      json({ url: "https://tilisy-sandbox.enablebanking.com/ais/start?x=1" }),
    ...overrides,
  });
}

describe("Banche (Open Banking)", () => {
  const assign = vi.fn();
  const original = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        assign,
        href: original.href,
        origin: original.origin,
        pathname: original.pathname,
        search: original.search,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
    assign.mockReset();
  });

  it("si sceglie la banca e si va alla sua pagina di autorizzazione", async () => {
    const fetchMock = backend();
    const { user } = await renderApp("/impostazioni");
    expect(await screen.findByText("Sandbox: solo banche di prova")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collega una banca" }));
    await user.type(await screen.findByLabelText("Cerca la banca"), "mock");
    expect(screen.queryByText("UniCredit")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collega Mock ASPSP" }));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("https://tilisy-sandbox.enablebanking.com/ais/start?x=1");
    });
    const [request] = calls(fetchMock, "POST", "/api/banks/authorize");
    expect(await request?.json()).toEqual({ aspsp_name: "Mock ASPSP", country: "IT" });
  });

  it("avvisa prima della scadenza del consenso e permette di rinnovarlo", async () => {
    const soon = new Date(Date.now() + 5 * 86_400_000 + 3_600_000).toISOString();
    const fetchMock = backend({
      "/api/sources": () => json([bankSource({ consent_expires_at: soon })]),
    });
    const { user } = await renderApp("/impostazioni");
    expect(await screen.findByText(/scade tra 5 giorni/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rinnova consenso" }));
    await waitFor(() => {
      expect(calls(fetchMock, "POST", "/api/banks/authorize")).toHaveLength(1);
    });
    const [request] = calls(fetchMock, "POST", "/api/banks/authorize");
    expect(await request?.json()).toEqual({ source_id: 7 });
  });

  it("consenso lontano dalla scadenza: nessun avviso", async () => {
    backend({ "/api/sources": () => json([bankSource()]) });
    await renderApp("/impostazioni");
    expect(await screen.findByText(/consenso fino al 4 apr 2027/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rinnova consenso" })).not.toBeInTheDocument();
  });

  it("scollega una banca scegliendo se tenere i movimenti", async () => {
    const fetchMock = backend({
      "/api/sources": () => json([bankSource()]),
      "DELETE /api/banks/sources/7": () => json({ deleted_transactions: 0 }),
    });
    const { user } = await renderApp("/impostazioni");
    await user.click(await screen.findByRole("button", { name: "Scollega" }));
    await user.click(screen.getByRole("button", { name: "Tieni i movimenti" }));
    await waitFor(() => {
      expect(calls(fetchMock, "DELETE", "/api/banks/sources/7")).toHaveLength(1);
    });
    const [request] = calls(fetchMock, "DELETE", "/api/banks/sources/7");
    expect(new URL(request?.url ?? "").searchParams.get("delete_data")).toBe("false");
  });

  it("al ritorno dalla banca salva il consenso e sincronizza", async () => {
    const fetchMock = backend({
      "POST /api/banks/callback": () =>
        json({
          source_id: 7,
          institution: "Mock ASPSP",
          accounts: 2,
          sync: {
            source_id: 7,
            status: "success",
            started_at: "2026-10-06T08:00:00Z",
            finished_at: "2026-10-06T08:00:05Z",
            jobs: [
              {
                job: "transactions",
                status: "success",
                fetched: 3,
                created: 3,
                updated: 0,
                details: {},
                error: null,
              },
            ],
          },
        }),
    });
    await renderApp("/impostazioni/ritorno-banca?code=abc&state=xyz");
    expect(await screen.findByText("Mock ASPSP collegata")).toBeInTheDocument();
    expect(screen.getByText(/2 conti autorizzati · 3 movimenti nuovi/)).toBeInTheDocument();
    const posted = calls(fetchMock, "POST", "/api/banks/callback");
    expect(posted).toHaveLength(1);
    expect(await posted[0]?.json()).toEqual({
      state: "xyz",
      code: "abc",
      error: null,
      error_description: null,
    });
  });

  it("se la banca rifiuta mostra il motivo", async () => {
    backend({
      "POST /api/banks/callback": () =>
        json({ detail: "La banca ha risposto: access_denied" }, 400),
    });
    await renderApp("/impostazioni/ritorno-banca?error=access_denied&state=xyz");
    expect(await screen.findByText("Collegamento non riuscito")).toBeInTheDocument();
    expect(screen.getByText(/access_denied/)).toBeInTheDocument();
  });
});
