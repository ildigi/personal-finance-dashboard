import { describe, expect, it } from "vitest";

import { browserLanguage, parseLanguagePreference, resolveLanguage } from "./languages";

describe("scelta della lingua", () => {
  it("la scelta salvata vince sulla lingua del browser", () => {
    expect(resolveLanguage("it", ["en-US"])).toBe("it");
    expect(resolveLanguage("en", ["it-IT"])).toBe("en");
  });

  it("senza scelta segue il browser", () => {
    expect(resolveLanguage("auto", ["it-IT", "en"])).toBe("it");
    expect(resolveLanguage("auto", ["en-GB"])).toBe("en");
    expect(browserLanguage(["de-DE", "it"])).toBe("it");
  });

  it("per le altre lingue usa l'inglese", () => {
    expect(browserLanguage(["de-DE", "fr"])).toBe("en");
    expect(browserLanguage([])).toBe("en");
  });

  it("un valore salvato sconosciuto vale come nessuna scelta", () => {
    expect(parseLanguagePreference("it")).toBe("it");
    expect(parseLanguagePreference("de")).toBe("auto");
    expect(parseLanguagePreference(null)).toBe("auto");
  });
});
