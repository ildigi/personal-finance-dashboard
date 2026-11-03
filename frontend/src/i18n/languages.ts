/**
 * Lingue dell'interfaccia (ADR 0006). La scelta salvata vince; senza scelta vale la lingua
 * del browser; per ogni altra lingua, l'inglese.
 */

export const LANGUAGES = ["en", "it"] as const;
export type Language = (typeof LANGUAGES)[number];

/** "auto" = segui la lingua del browser. */
export type LanguagePreference = Language | "auto";

export const LANGUAGE_STORAGE_KEY = "fd-language";
export const FALLBACK_LANGUAGE: Language = "en";

/** Nome di ogni lingua nella lingua stessa: non cambia con l'interfaccia. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", it: "Italiano" };

/** Locale di Intl per numeri, valute e date. */
export const INTL_LOCALES: Record<Language, string> = { en: "en-GB", it: "it-IT" };

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

export function parseLanguagePreference(raw: string | null): LanguagePreference {
  return isLanguage(raw) ? raw : "auto";
}

function navigatorLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

/** Prima lingua del browser che l'interfaccia conosce ("it-IT" → "it"), altrimenti inglese. */
export function browserLanguage(languages: readonly string[] = navigatorLanguages()): Language {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split("-")[0];
    if (isLanguage(primary)) return primary;
  }
  return FALLBACK_LANGUAGE;
}

export function resolveLanguage(
  preference: LanguagePreference,
  languages?: readonly string[],
): Language {
  return preference === "auto" ? browserLanguage(languages) : preference;
}
