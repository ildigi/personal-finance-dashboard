import { afterEach, describe, expect, it } from "vitest";

import { detailOf } from "@/api/client";
import schema from "@/api/openapi.json";

import { i18n } from "./index";
import { hasMessage, messageText } from "./messages";

const CODES = (schema as { "x-message-codes": string[] })["x-message-codes"];

afterEach(async () => {
  await i18n.changeLanguage("it");
});

describe("codici dei messaggi del backend", () => {
  it("lo schema esporta l'elenco dei codici", () => {
    expect(CODES.length).toBeGreaterThan(50);
  });

  it.each(["it", "en"])("ogni codice ha una traduzione (%s)", async (language) => {
    await i18n.changeLanguage(language);
    const missing = CODES.filter((code) => !hasMessage(code));
    expect(missing).toEqual([]);
  });

  it("i parametri entrano nel testo, le date nel formato della lingua", async () => {
    expect(messageText("reason.travel_day", { date: "2026-08-11" })).toBe(
      "Pagato durante un viaggio (11 ago 2026)",
    );
    await i18n.changeLanguage("en");
    expect(messageText("reason.travel_day", { date: "2026-08-11" })).toBe(
      "Paid during a trip (11 Aug 2026)",
    );
    expect(messageText("reason.rule", { rule: "Netflix" })).toBe("Rule “Netflix”");
  });

  it("un codice sconosciuto mostra il testo di ripiego o il codice", () => {
    expect(messageText("nuovo.codice", {}, "testo")).toBe("testo");
    expect(messageText("nuovo.codice")).toBe("nuovo.codice");
  });
});

describe("corpo d'errore dell'API", () => {
  it("traduce codice e parametri nella lingua scelta", async () => {
    const body = { detail: { code: "bank.unavailable", params: { bank: "CA" } } };
    expect(detailOf(body)).toBe("Banca non disponibile: CA");
    await i18n.changeLanguage("en");
    expect(detailOf(body)).toBe("Bank not available: CA");
  });

  it("legge gli errori di validazione di FastAPI dal loro codice", async () => {
    await i18n.changeLanguage("en");
    const body = {
      detail: [{ type: "rule.condition_required", msg: "at least one condition", loc: [] }],
    };
    expect(detailOf(body)).toBe("At least one condition is needed");
    const generic = { detail: [{ type: "missing", msg: "Field required", loc: [] }] };
    expect(detailOf(generic)).toBe("Field required");
  });

  it("un testo semplice resta com'è", () => {
    expect(detailOf({ detail: "Bad Gateway" })).toBe("Bad Gateway");
    expect(detailOf(null)).toBeNull();
  });
});
