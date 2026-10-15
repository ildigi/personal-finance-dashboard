import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { json, mockBackend, renderApp } from "./helpers";

const LOCKED = { enabled: true, configured: true, authenticated: false };

describe("Accesso", () => {
  it("in locale (accesso spento) la dashboard si apre subito", async () => {
    mockBackend({
      "/api/auth/status": () => json({ enabled: false, configured: false, authenticated: true }),
    });
    const { router } = await renderApp("/movimenti");
    expect(router.state.location.pathname).toBe("/movimenti");
  });

  it("senza sessione porta alla pagina di accesso e poi torna dov'eri", async () => {
    let status = LOCKED;
    const logins: unknown[] = [];
    mockBackend({
      "/api/auth/status": () => json(status),
      "POST /api/auth/login": async (_url, request) => {
        logins.push(await request.json());
        status = { ...LOCKED, authenticated: true };
        return new Response(null, { status: 204 });
      },
    });
    const { user, router } = await renderApp("/regole");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/accesso");
    });
    expect(router.state.location.search).toBe("?da=%2Fregole");

    await user.type(await screen.findByLabelText("Password"), "FAKEPASSWORDTEST1");
    await user.type(screen.getByLabelText("Codice"), "123 456");
    await user.click(screen.getByRole("button", { name: "Accedi" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/regole");
    });
    expect(logins).toEqual([{ password: "FAKEPASSWORDTEST1", code: "123456" }]);
  });

  it("mostra l'errore e svuota il codice se è sbagliato", async () => {
    mockBackend({
      "/api/auth/status": () => json(LOCKED),
      "POST /api/auth/login": () => json({ detail: "Password o codice non validi" }, 401),
    });
    const { user } = await renderApp("/accesso");
    await user.type(await screen.findByLabelText("Password"), "sbagliata");
    await user.type(screen.getByLabelText("Codice"), "000000");
    await user.click(screen.getByRole("button", { name: "Accedi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Password o codice non validi");
    expect(screen.getByLabelText("Codice")).toHaveValue("");
  });

  it("non rimanda mai fuori dalla dashboard", async () => {
    mockBackend({ "/api/auth/status": () => json({ ...LOCKED, authenticated: true }) });
    const { router } = await renderApp("/accesso?da=//sito-esterno.example");
    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe("/");
      },
      { timeout: 5000 },
    );
  });
});
