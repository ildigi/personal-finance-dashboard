import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockBackend, pageTitle, renderApp } from "./helpers";

// --- Privacy e termini -----------------------------------------------------------------------

describe("Pagine di privacy e termini", () => {
  it.each([
    ["/privacy", "Informativa sulla privacy"],
    ["/termini", "Termini di utilizzo"],
  ])("%s si apre da sola, senza la navigazione dell'app", async (path, title) => {
    mockBackend();
    await renderApp(path);

    expect(pageTitle()).toHaveTextContent(title);
    expect(screen.getByText("Ultimo aggiornamento: 6 ottobre 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Periodo:/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Pagina non trovata")).not.toBeInTheDocument();
    expect(document.title).toBe(`${title} · Finanze`);
  });
});
