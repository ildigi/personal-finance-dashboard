import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { periodStore, privacyStore, themeStore } from "@/lib/preferences";

import { HEALTH, json, mockBackend, pageTitle, renderApp } from "./helpers";

beforeEach(() => {
  privacyStore.set(false);
  themeStore.set("system");
  periodStore.set("this_month");
});

// --- Panoramica ------------------------------------------------------------------------------

describe("Panoramica", () => {
  it("mostra lo stato del backend e i conti dal database", async () => {
    mockBackend();
    await renderApp();

    expect(await screen.findByText("Conto corrente CA")).toBeInTheDocument();
    expect(screen.getByText("Revolut EUR")).toBeInTheDocument();
    expect(screen.getByText("Operativo")).toBeInTheDocument();
    expect(screen.getByText("Connesso")).toBeInTheDocument();
    expect(screen.getByText("Aggiornato")).toBeInTheDocument();
    expect(screen.getByText("Backend connesso")).toBeInTheDocument();
    expect(pageTitle()).toHaveTextContent("Panoramica");
  });

  it("non mostra mai l'IBAN completo", async () => {
    mockBackend();
    await renderApp();
    expect(await screen.findByText(/IT00 •••• •••• 0000/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("IT00X0000000000000000000000");
  });

  it("mostra uno stato vuoto se non ci sono conti", async () => {
    mockBackend({ "/api/accounts": () => json([]) });
    await renderApp();
    expect(await screen.findByText("Nessun conto collegato")).toBeInTheDocument();
  });

  it("avvisa quando il backend è spento", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await renderApp();
    expect(await screen.findByRole("alert")).toHaveTextContent("Il backend non risponde");
    expect(screen.getByText("Backend non raggiungibile")).toBeInTheDocument();
  });

  it("segnala il database irraggiungibile (503 con corpo)", async () => {
    mockBackend({
      "/api/health": () =>
        json({ ...HEALTH, status: "error", database: { ...HEALTH.database, ok: false } }, 503),
    });
    await renderApp();
    expect(await screen.findByText("Database non raggiungibile")).toBeInTheDocument();
  });
});

// --- Navigazione ---------------------------------------------------------------------------

describe("Navigazione", () => {
  it("la sidebar porta a tutte le pagine (PC)", async () => {
    mockBackend();
    const { user, router } = await renderApp();
    const sidebar = screen.getByRole("navigation", { name: "Navigazione principale" });

    await user.click(within(sidebar).getByRole("link", { name: "Movimenti" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/movimenti");
    });
    expect(await screen.findByRole("button", { name: /Nuovo movimento/ })).toBeInTheDocument();
    expect(pageTitle()).toHaveTextContent("Movimenti");
    expect(within(sidebar).getByRole("link", { name: "Movimenti" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    for (const [label, path] of [
      ["Spese", "/spese"],
      ["Entrate", "/entrate"],
      ["Investimenti", "/investimenti"],
      ["Patrimonio netto", "/patrimonio"],
      ["Budget", "/budget"],
      ["Regole", "/regole"],
      ["Impostazioni", "/impostazioni"],
      ["Panoramica", "/"],
    ] as const) {
      await user.click(within(sidebar).getByRole("link", { name: label }));
      // Le pagine con i grafici si caricano su richiesta: sotto carico serve più di 1 s.
      await waitFor(
        () => {
          expect(router.state.location.pathname).toBe(path);
          expect(pageTitle()).toHaveTextContent(label);
        },
        { timeout: 4000 },
      );
    }
    // Visita nove pagine: con tutti i file in parallelo i 5 s predefiniti non bastano.
  }, 20_000);

  it("la barra in basso e il pannello Altro funzionano (telefono)", async () => {
    mockBackend();
    const { user, router } = await renderApp();
    const tabs = screen.getByRole("navigation", { name: "Navigazione rapida" });

    await user.click(within(tabs).getByRole("link", { name: /Spese/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/spese");
    });

    await user.click(within(tabs).getByRole("button", { name: "Altre pagine e preferenze" }));
    const sheet = await screen.findByRole("dialog");
    for (const label of ["Entrate", "Patrimonio", "Budget", "Regole", "Impostazioni"]) {
      expect(within(sheet).getByRole("link", { name: label })).toBeInTheDocument();
    }
    await user.click(within(sheet).getByRole("link", { name: "Budget" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/budget");
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("mostra una pagina 404 per indirizzi sconosciuti", async () => {
    mockBackend();
    await renderApp("/non-esiste");
    expect(await screen.findByText("Pagina non trovata", { selector: "h3" })).toBeInTheDocument();
  });
});

// --- Preferenze ------------------------------------------------------------------------------

describe("Preferenze", () => {
  it("la modalità privacy si attiva col pulsante e col tasto P", async () => {
    mockBackend();
    const { user } = await renderApp();
    const root = document.documentElement;

    await user.click(screen.getByRole("button", { name: "Nascondi gli importi" }));
    expect(root.dataset.privacy).toBe("on");
    expect(localStorage.getItem("fd-privacy")).toBe("on");

    await user.keyboard("p");
    expect(root.dataset.privacy).toBeUndefined();
  });

  it("il tasto P non scatta mentre si scrive in un campo", async () => {
    mockBackend();
    const { user } = await renderApp();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    await user.keyboard("p");
    expect(document.documentElement.dataset.privacy).toBeUndefined();
    input.remove();
  });

  it("il tema scelto nelle impostazioni viene applicato e ricordato", async () => {
    mockBackend();
    const { user } = await renderApp("/impostazioni");
    const group = await screen.findByRole("radiogroup", { name: "Tema" });

    await user.click(within(group).getByRole("radio", { name: "Scuro" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("fd-theme")).toBe("dark");

    await user.click(within(group).getByRole("radio", { name: "Chiaro" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("il periodo globale si cambia dal selettore", async () => {
    mockBackend();
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /^Periodo: Mese corrente/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: /Ultimi 3 mesi/ }));
    expect(periodStore.get()).toBe("last_3_months");
    expect(screen.getByRole("button", { name: /^Periodo: Ultimi 3 mesi/ })).toBeInTheDocument();
  });
});

// --- Impostazioni ----------------------------------------------------------------------------

describe("Impostazioni", () => {
  it("elenca categorie e sottocategorie dal database", async () => {
    mockBackend();
    await renderApp("/impostazioni");
    expect(await screen.findByText("Trasporti")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sottocategoria Bus/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sottocategoria Treno/ })).toBeInTheDocument();
    expect(screen.getByText("Fuori dalle spese")).toBeInTheDocument();
    expect(await screen.findByText("Stipendio")).toBeInTheDocument();
  });
});
