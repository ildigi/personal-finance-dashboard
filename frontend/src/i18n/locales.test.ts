import { describe, expect, it } from "vitest";

import { en } from "./locales/en";
import { it as itMessages } from "./locales/it";

interface Tree {
  readonly [key: string]: string | Tree;
}

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const IT = flatten(itMessages);
const EN = flatten(en);

/** `{{nome}}` e `<tag>`: devono essere gli stessi nelle due lingue. */
const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}|<\/?(\w+)>/g)].map((m) => m[0].replace(/\s/g, "")).sort();

describe("traduzioni", () => {
  it("inglese e italiano hanno esattamente le stesse chiavi", () => {
    expect([...EN.keys()].sort()).toEqual([...IT.keys()].sort());
  });

  it("nessuna traduzione è vuota", () => {
    for (const [key, value] of [...IT, ...EN]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("segnaposto e tag coincidono", () => {
    for (const [key, value] of IT) {
      expect(placeholders(EN.get(key) ?? ""), key).toEqual(placeholders(value));
    }
  });

  // Glossario obbligatorio (SPEC §18): ogni termine presente nei file usa la traduzione fissata.
  it.each([
    ["nav.items.overview.label", "Panoramica", "Overview"],
    ["nav.items.transactions.label", "Movimenti", "Transactions"],
    ["nav.items.expenses.label", "Spese", "Expenses"],
    ["nav.items.income.label", "Entrate", "Income"],
    ["nav.items.netWorth.label", "Patrimonio netto", "Net worth"],
    ["nav.items.investments.label", "Investimenti", "Investments"],
    ["nav.items.recurring.label", "Ricorrenze", "Recurring payments"],
    ["nav.items.budgets.label", "Budget", "Budgets"],
    ["common.privacyMode", "Modalità privacy", "Privacy mode"],
    ["connections.status.expired", "Consenso scaduto", "Bank consent expired"],
    ["banks.consent.renew", "Rinnova consenso", "Renew bank consent"],
  ])("glossario: %s", (key, italian, english) => {
    expect(IT.get(key)).toBe(italian);
    expect(EN.get(key)).toBe(english);
  });
});
