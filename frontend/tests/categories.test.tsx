import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CATEGORIES, json, mockBackend, renderApp, type Handler } from "./helpers";

const NO_USAGE = {
  transactions: 0,
  rules: 0,
  budgets: 0,
  recurring: 0,
  merchants: 0,
  overrides: 0,
  in_use: false,
};

const MERCHANTS = {
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
  limit: 30,
  offset: 0,
};

/** Backend delle impostazioni che registra i corpi delle richieste di scrittura. */
function settingsBackend(extra: Record<string, Handler> = {}) {
  const sent: { route: string; body: unknown }[] = [];
  const record =
    (route: string, response: unknown = {}, status = 200): Handler =>
    async (_url, request) => {
      const text = await request.text();
      sent.push({ route, body: text ? (JSON.parse(text) as unknown) : null });
      return status === 204 ? new Response(null, { status }) : json(response, status);
    };
  mockBackend({
    "/api/merchants": () => json(MERCHANTS),
    "PATCH /api/subcategories/1": record("PATCH sub 1", CATEGORIES[0]?.subcategories[0]),
    "PATCH /api/categories/1": record("PATCH cat 1", CATEGORIES[0]),
    "POST /api/categories/1/subcategories": record("POST sub", CATEGORIES[0]?.subcategories[0]),
    "DELETE /api/subcategories/1": record("DELETE sub 1", null, 204),
    "POST /api/subcategories/1/merge": record("MERGE sub 1", {
      category: CATEGORIES[0],
      moved_transactions: 12,
    }),
    "PATCH /api/merchants/3": record("PATCH merchant 3", MERCHANTS.items[0]),
    "/api/subcategories/1/usage": () => json(NO_USAGE),
    ...extra,
  });
  return sent;
}

async function openSubcategoryMenu(name: string) {
  const { user } = await renderApp("/impostazioni");
  await user.click(
    await screen.findByRole("button", { name: `Azioni per la sottocategoria ${name}` }),
  );
  return user;
}

describe("Impostazioni · rinomina sul posto", () => {
  it("rinomina una sottocategoria con Invio e riporta il focus sulla chip", async () => {
    const sent = settingsBackend();
    const user = await openSubcategoryMenu("Bus");
    await user.click(await screen.findByRole("menuitem", { name: "Rinomina" }));

    const input = screen.getByRole("textbox", { name: "Nuovo nome della sottocategoria Bus" });
    expect(input).toHaveValue("Bus");
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    await user.clear(input);
    await user.type(input, "Autobus{Enter}");

    await waitFor(() => {
      expect(sent).toContainEqual({ route: "PATCH sub 1", body: { name: "Autobus" } });
    });
    expect(screen.queryByRole("textbox", { name: /Nuovo nome/ })).not.toBeInTheDocument();
    await waitFor(() => {
      // Il backend simulato restituisce sempre "Bus": conta che il focus sia sulla stessa chip.
      expect(
        screen.getByRole("button", { name: /^Azioni per la sottocategoria (Autobus|Bus)$/ }),
      ).toHaveFocus();
    });
  });

  it("Esc annulla la modifica senza salvare", async () => {
    const sent = settingsBackend();
    const user = await openSubcategoryMenu("Bus");
    await user.click(await screen.findByRole("menuitem", { name: "Rinomina" }));
    const input = screen.getByRole("textbox", { name: "Nuovo nome della sottocategoria Bus" });
    await user.type(input, "xyz{Escape}");

    expect(screen.queryByRole("textbox", { name: /Nuovo nome/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Azioni per la sottocategoria Bus" })).toBeVisible();
    expect(sent).toEqual([]);
  });

  it("rinomina una categoria nello stesso modo, salvando quando si esce dal campo", async () => {
    const sent = settingsBackend();
    const { user } = await renderApp("/impostazioni");
    await user.click(await screen.findByRole("button", { name: "Azioni per Trasporti" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rinomina" }));

    const input = screen.getByRole("textbox", { name: "Nuovo nome della categoria Trasporti" });
    await user.clear(input);
    await user.type(input, "Mobilità");
    await user.tab();

    await waitFor(() => {
      expect(sent).toContainEqual({ route: "PATCH cat 1", body: { name: "Mobilità" } });
    });
  });

  it("aggiunge una sottocategoria dalla chip +", async () => {
    const sent = settingsBackend();
    const { user } = await renderApp("/impostazioni");
    await user.click(
      await screen.findByRole("button", { name: "Aggiungi una sottocategoria a Trasporti" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Nome della nuova sottocategoria di Trasporti" }),
      "Taxi{Enter}",
    );
    await waitFor(() => {
      expect(sent).toContainEqual({ route: "POST sub", body: { name: "Taxi" } });
    });
  });

  it("rinomina un merchant sul posto: la matita diventa conferma", async () => {
    const sent = settingsBackend();
    const { user } = await renderApp("/impostazioni");
    await user.click(await screen.findByRole("button", { name: "Rinomina Netflix" }));
    const input = screen.getByRole("textbox", { name: "Nuovo nome di Netflix" });
    await user.clear(input);
    await user.type(input, "Netflix Italia");
    await user.click(screen.getByRole("button", { name: "Salva il nome di Netflix" }));

    await waitFor(() => {
      expect(sent).toContainEqual({ route: "PATCH merchant 3", body: { name: "Netflix Italia" } });
    });
    expect(screen.getByRole("button", { name: "Rinomina Netflix" })).toBeInTheDocument();
  });
});

describe("Impostazioni · eliminazione delle sottocategorie", () => {
  it("una sottocategoria inutilizzata si elimina dopo la conferma", async () => {
    const sent = settingsBackend();
    const user = await openSubcategoryMenu("Bus");
    await user.click(await screen.findByRole("menuitem", { name: "Elimina…" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Eliminare «Bus»?" });
    expect(await within(dialog).findByText(/viene eliminata subito/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Elimina" }));

    await waitFor(() => {
      expect(sent).toContainEqual({ route: "DELETE sub 1", body: null });
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("se è in uso dice cosa la usa e sposta tutto sulla sottocategoria scelta", async () => {
    const sent = settingsBackend({
      "/api/subcategories/1/usage": () =>
        json({
          transactions: 12,
          rules: 2,
          budgets: 1,
          recurring: 0,
          merchants: 1,
          overrides: 3,
          in_use: true,
        }),
    });
    const user = await openSubcategoryMenu("Bus");
    await user.click(await screen.findByRole("menuitem", { name: "Elimina…" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Eliminare «Bus»?" });
    const description = await within(dialog).findByText(/È usata da/);
    expect(description).toHaveTextContent(
      "12 movimenti, 3 correzioni manuali, 2 regole, il suo budget, 1 merchant (categoria predefinita)",
    );
    // Di partenza: nessuna sottocategoria, quindi il budget della sottocategoria se ne va.
    expect(within(dialog).getByText(/Il budget di «Bus» viene eliminato/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("combobox", { name: "Sposta su" }));
    await user.click(await screen.findByRole("option", { name: "Treno" }));
    expect(within(dialog).getByText(/Il budget passa a «Treno»/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Sposta ed elimina" }));

    await waitFor(() => {
      expect(sent).toContainEqual({ route: "MERGE sub 1", body: { into_id: 2 } });
    });
    expect(sent.some((s) => s.route === "DELETE sub 1")).toBe(false);
  });

  it("senza scelta i movimenti restano nella categoria", async () => {
    const sent = settingsBackend({
      "/api/subcategories/1/usage": () => json({ ...NO_USAGE, transactions: 1, in_use: true }),
    });
    const user = await openSubcategoryMenu("Bus");
    await user.click(await screen.findByRole("menuitem", { name: "Elimina…" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(await within(dialog).findByText(/1 movimento\b/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Sposta ed elimina" }));
    await waitFor(() => {
      expect(sent).toContainEqual({ route: "MERGE sub 1", body: { into_id: null } });
    });
  });

  it("Annulla chiude il dialogo senza eliminare", async () => {
    const sent = settingsBackend();
    const user = await openSubcategoryMenu("Bus");
    await user.click(await screen.findByRole("menuitem", { name: "Elimina…" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Annulla" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(sent).toEqual([]);
  });
});
