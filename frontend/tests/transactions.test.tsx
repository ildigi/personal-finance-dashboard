import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/api/client";
import { periodStore, privacyStore } from "@/lib/preferences";

import { json, mockBackend, renderApp } from "./helpers";

type Tx = Schemas["TransactionRead"];

function tx(overrides: Partial<Tx>): Tx {
  return {
    id: 1,
    account_id: 1,
    external_id: "B-1",
    booking_date: "2026-10-03",
    value_date: "2026-10-03",
    status: "booked",
    amount: "-12.50",
    currency: "EUR",
    amount_eur: "-12.50",
    original_amount: null,
    original_currency: null,
    fx_rate: null,
    description_raw: "PAGAMENTO POS ESSELUNGA MILANO",
    description_clean: "PAGAMENTO POS ESSELUNGA MILANO",
    counterparty_name: null,
    counterparty_iban: null,
    merchant_id: null,
    merchant_name: null,
    kind: "expense",
    category_id: null,
    subcategory_id: null,
    income_type_id: null,
    classification_source: "none",
    rule_id: null,
    classification_reason: null,
    classification_params: null,
    classification_note: null,
    description_code: null,
    transfer_pair_id: null,
    recurring_id: null,
    refund_of_id: null,
    notes: null,
    is_manual: false,
    tags: [],
    created_at: "2026-10-03T10:00:00Z",
    updated_at: "2026-10-03T10:00:00Z",
    ...overrides,
  };
}

const ROWS: Tx[] = [
  tx({ id: 1 }),
  tx({
    id: 2,
    booking_date: "2026-10-02",
    amount: "1500.00",
    amount_eur: "1500.00",
    description_clean: "BONIFICO STIPENDIO ACME",
    kind: "income",
    counterparty_name: "ACME S.R.L.",
  }),
  tx({
    id: 3,
    account_id: 2,
    booking_date: "2026-10-02",
    amount: "-9.90",
    amount_eur: "-9.90",
    description_clean: "Trenitalia",
    category_id: 1,
    subcategory_id: 2,
    status: "pending",
  }),
];

function page(items: Tx[], total = items.length) {
  return {
    items,
    total,
    limit: 50,
    offset: 0,
    totals: { count: total, inflow_eur: "1500.00", outflow_eur: "-22.40" },
  };
}

function mockTransactions(items: Tx[] = ROWS, total?: number) {
  const calls: URL[] = [];
  const posts: unknown[] = [];
  mockBackend({
    "/api/transactions": (url) => {
      calls.push(url);
      return json(page(items, total));
    },
    "POST /api/transactions": async (_url, request) => {
      posts.push(await request.json());
      return json(
        { ...ROWS[0], id: 99, overrides: [], raw: null, provider_category: null, mcc: null },
        201,
      );
    },
    "/api/transactions/1": () =>
      json({
        ...ROWS[0],
        provider_category: "groceries",
        mcc: "5411",
        raw: { transactionId: "B-1", mock: true },
        overrides: [],
      }),
  });
  return { calls, posts };
}

beforeEach(() => {
  privacyStore.set(false);
  periodStore.set("this_month");
});

describe("Movimenti", () => {
  it("mostra movimenti, totali del filtro e raggruppamento per giorno", async () => {
    mockTransactions();
    await renderApp("/movimenti");

    expect(await screen.findByText("PAGAMENTO POS ESSELUNGA MILANO")).toBeInTheDocument();
    expect(screen.getByText("BONIFICO STIPENDIO ACME")).toBeInTheDocument();
    expect(screen.getByText("Trenitalia")).toBeInTheDocument();
    expect(screen.getByText("In sospeso")).toBeInTheDocument();
    // Una volta nella riga, una nel totale delle entrate.
    expect(screen.getAllByText(/\+1\.500,00/)).toHaveLength(2);
    expect(screen.getByText("3 di 3 movimenti")).toBeInTheDocument();
    // Categoria risolta dal nome, "Da classificare" per gli altri
    expect(screen.getByText(/Trasporti › Treno ·/)).toBeInTheDocument();
    expect(screen.getAllByText(/Da classificare ·/)).toHaveLength(2);
  });

  it("invia periodo globale e filtri al backend", async () => {
    const { calls } = mockTransactions();
    const { user, router } = await renderApp("/movimenti");
    await screen.findByText("Trenitalia");

    const first = calls[0];
    expect(first?.searchParams.get("date_from")).toMatch(/^\d{4}-\d{2}-01$/);
    expect(first?.searchParams.get("sort")).toBe("date_desc");

    await user.type(screen.getByRole("searchbox", { name: "Cerca nei movimenti" }), "esselunga");
    await waitFor(() => {
      expect(calls.at(-1)?.searchParams.get("q")).toBe("esselunga");
    });
    expect(router.state.location.search).toContain("q=esselunga");

    await user.click(screen.getByRole("button", { name: "Da classificare" }));
    await waitFor(() => {
      expect(calls.at(-1)?.searchParams.get("unclassified")).toBe("true");
    });
    expect(screen.getByRole("button", { name: /Azzera \(2\)/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Azzera/ }));
    await waitFor(() => {
      expect(calls.at(-1)?.searchParams.get("q")).toBeNull();
    });
    expect(screen.getByRole("searchbox", { name: "Cerca nei movimenti" })).toHaveValue("");
  });

  it("legge i filtri dall'indirizzo", async () => {
    const { calls } = mockTransactions();
    await renderApp("/movimenti?tipo=income&stato=pending&conto=2");
    await screen.findByText("Trenitalia");
    const params = calls[0]?.searchParams;
    expect(params?.get("kind")).toBe("income");
    expect(params?.get("status")).toBe("pending");
    expect(params?.get("account_id")).toBe("2");
  });

  it("propone di azzerare i filtri quando non trova nulla", async () => {
    mockTransactions([]);
    await renderApp("/movimenti?q=nulla");
    expect(await screen.findByText("Nessun movimento con questi filtri")).toBeInTheDocument();
  });

  it("apre il dettaglio con il dato originale del provider", async () => {
    mockTransactions();
    const { user } = await renderApp("/movimenti");
    await user.click(await screen.findByText("PAGAMENTO POS ESSELUNGA MILANO"));

    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("Non ancora classificato")).toBeInTheDocument();
    expect(within(sheet).getByText(/groceries · MCC 5411/)).toBeInTheDocument();
    expect(within(sheet).getByText("Dato originale del provider")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /Elimina/ })).not.toBeInTheDocument();
  });

  it("inserisce un movimento manuale validando i campi", async () => {
    const { posts } = mockTransactions();
    const { user } = await renderApp("/movimenti");
    await screen.findByText("Trenitalia");

    await user.click(screen.getByRole("button", { name: /Nuovo movimento/ }));
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "Salva movimento" }));
    expect(within(sheet).getByText("Importo non valido: es. 12,50")).toBeInTheDocument();
    expect(within(sheet).getByText("Scrivi una descrizione")).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    await user.type(within(sheet).getByLabelText("Importo (€)"), "12,5");
    expect(within(sheet).getByText(/Verrà registrato come -12,50/)).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("Descrizione"), "Cena da Gino");
    await user.click(within(sheet).getByRole("button", { name: "Salva movimento" }));

    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect(posts[0]).toMatchObject({
      amount: "-12.50",
      currency: "EUR",
      description: "Cena da Gino",
      category_id: null,
    });
    expect(typeof (posts[0] as { account_id: unknown }).account_id).toBe("number");
  });

  it("non manda importi come numeri JSON", async () => {
    const { posts } = mockTransactions();
    const { user } = await renderApp("/movimenti");
    await screen.findByText("Trenitalia");
    await user.click(screen.getByRole("button", { name: /Nuovo movimento/ }));
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("radio", { name: "Entrata" }));
    await user.type(within(sheet).getByLabelText("Importo (€)"), "1.234,56");
    await user.type(within(sheet).getByLabelText("Descrizione"), "Rimborso");
    await user.click(within(sheet).getByRole("button", { name: "Salva movimento" }));
    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    expect((posts[0] as { amount: unknown }).amount).toBe("1234.56");
  });

  it("mostra un errore se il backend non risponde", async () => {
    mockBackend({ "/api/transactions": () => Promise.reject(new TypeError("Failed to fetch")) });
    await renderApp("/movimenti");
    expect(await screen.findByText("Movimenti non disponibili")).toBeInTheDocument();
  });

  it("ripristina la classificazione automatica dal dettaglio", async () => {
    const resets: string[] = [];
    const corrected = {
      ...ROWS[0],
      category_id: 1,
      classification_source: "manual" as const,
      provider_category: null,
      mcc: null,
      raw: null,
      overrides: [
        {
          field: "category_id",
          old_value: null,
          new_value: "1",
          updated_at: "2026-10-03T10:00:00Z",
        },
      ],
    };
    let current: object = corrected;
    mockBackend({
      "/api/transactions": () => json(page(ROWS)),
      "/api/transactions/1": () => json(current),
      "DELETE /api/transactions/1/overrides": (url) => {
        resets.push(url.pathname);
        current = {
          ...corrected,
          category_id: null,
          classification_source: "none",
          overrides: [],
        };
        return json(current);
      },
    });
    const { user } = await renderApp("/movimenti");
    const [row] = await screen.findAllByText("PAGAMENTO POS ESSELUNGA MILANO");
    if (!row) throw new Error("riga non trovata");
    await user.click(row);
    await user.click(
      await screen.findByRole("button", { name: "Ripristina la classificazione automatica" }),
    );
    await waitFor(() => {
      expect(resets).toEqual(["/api/transactions/1/overrides"]);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Ripristina la classificazione automatica" }),
      ).not.toBeInTheDocument();
    });
  });
});

vi.setConfig({ testTimeout: 15_000 });
