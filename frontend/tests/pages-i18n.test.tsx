import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { i18n } from "@/i18n";
import type { Language } from "@/i18n/languages";
import { languageStore } from "@/lib/preferences";

import { ACCOUNTS, CATEGORIES, mockBackend, pageTitle, renderApp } from "./helpers";

// Le pagine principali in entrambe le lingue (fase I2): titolo dalla traduzione e, in inglese,
// nessuna parola italiana fuori dai dati (che non si traducono mai).
const PAGES = [
  ["/", "overview"],
  ["/movimenti", "transactions"],
  ["/spese", "expenses"],
  ["/entrate", "income"],
  ["/investimenti", "investments"],
  ["/patrimonio", "netWorth"],
  ["/budget", "budgets"],
  ["/ricorrenze", "recurring"],
  ["/regole", "rules"],
  ["/impostazioni", "settings"],
] as const;

/** Parole italiane frequenti che in un testo inglese non compaiono. */
const ITALIAN =
  /\b(di|del|della|dei|delle|non|nessun[ao]?|il|gli|che|caricamento|sono|movimenti|spese|entrate)\b/i;

/** Testo della pagina senza i dati del backend simulato (nomi di conti e categorie). */
function pageText(): string {
  let text = document.body.textContent;
  const data = [
    ...ACCOUNTS.flatMap((a) => [a.name, a.institution]),
    ...CATEGORIES.flatMap((c) => [c.name, ...c.subcategories.map((s) => s.name)]),
    "Stipendio",
  ];
  for (const value of data) text = text.split(value).join(" ");
  return text;
}

describe.each<Language>(["it", "en"])("pagine principali (%s)", (language) => {
  const t = i18n.getFixedT(language);

  it.each(PAGES)("%s", async (path, id) => {
    languageStore.set(language);
    mockBackend();
    await renderApp(path);

    expect(pageTitle()).toHaveTextContent(t(`nav.items.${id}.label`));
    // Le richieste al backend simulato finiscono: anche gli stati d'errore sono testo.
    await waitFor(() => {
      expect(document.querySelector("[aria-busy='true']")).toBeNull();
    });
    // In italiano lo stesso controllo trova parole italiane: non è un controllo a vuoto.
    if (language === "en") expect(pageText()).not.toMatch(ITALIAN);
    else expect(pageText()).toMatch(ITALIAN);
  });
});
