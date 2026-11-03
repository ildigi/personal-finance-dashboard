import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { i18n } from "@/i18n";
import type { Language } from "@/i18n/languages";
import { languageStore } from "@/lib/preferences";

import { mockBackend, pageTitle, renderApp } from "./helpers";

// Prima pagina tradotta (fase I1): stessi controlli in entrambe le lingue, testi presi dai file
// di traduzione.
describe.each<Language>(["it", "en"])("Impostazioni (%s)", (language) => {
  const t = i18n.getFixedT(language);

  it("mostra la pagina e la shell nella lingua scelta", async () => {
    languageStore.set(language);
    mockBackend();
    await renderApp("/impostazioni");

    expect(pageTitle()).toHaveTextContent(t("nav.items.settings.label"));
    expect(document.documentElement.lang).toBe(language);
    expect(document.title).toBe(
      t("common.documentTitle", { page: t("nav.items.settings.label"), app: t("common.appName") }),
    );
    for (const title of [
      t("settings.appearance.title"),
      t("settings.language.title"),
      t("settings.privacy.title"),
      t("connections.title"),
      t("categories.title"),
      t("merchants.title"),
      t("settings.incomeTypes.title"),
    ]) {
      expect(screen.getByText(title, { selector: "[data-slot=card-title]" })).toBeInTheDocument();
    }
    const nav = screen.getByRole("navigation", { name: t("nav.main") });
    expect(within(nav).getByRole("link", { name: t("nav.items.overview.label") })).toBeVisible();
    expect(await screen.findByText(t("categories.excluded"))).toBeInTheDocument();
    // I dati restano come sono nel database, in qualunque lingua.
    expect(screen.getByText("Trasporti")).toBeInTheDocument();
  });
});

describe("selettore di lingua", () => {
  it("passa all'inglese subito, e lo ricorda nel browser", async () => {
    mockBackend();
    const { user } = await renderApp("/impostazioni");
    expect(pageTitle()).toHaveTextContent("Impostazioni");
    expect(screen.getByText("1.234,56 €")).toBeInTheDocument();

    const group = screen.getByRole("radiogroup", { name: "Lingua" });
    await user.click(within(group).getByRole("radio", { name: "English" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(localStorage.getItem("fd-language")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByText("€1,234.56")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
  });

  it("«Automatica» segue il browser (in jsdom, inglese)", async () => {
    mockBackend();
    const { user } = await renderApp("/impostazioni");
    await user.click(screen.getByRole("radio", { name: "Automatica" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(localStorage.getItem("fd-language")).toBe("auto");
    expect(screen.getByText("Same as the browser: English")).toBeInTheDocument();
  });
});
