/**
 * Configurazione di i18next (ADR 0006). Le traduzioni sono nel bundle, quindi
 * l'inizializzazione è sincrona: al primo render la lingua è già quella giusta.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  FALLBACK_LANGUAGE,
  INTL_LOCALES,
  isLanguage,
  LANGUAGE_STORAGE_KEY,
  LANGUAGES,
  parseLanguagePreference,
  resolveLanguage,
  type Language,
  type LanguagePreference,
} from "./languages";
import { en } from "./locales/en";
import { it } from "./locales/it";

export const resources = { en: { translation: en }, it: { translation: it } } as const;

function storedPreference(): LanguagePreference {
  try {
    return parseLanguagePreference(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(storedPreference()),
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: LANGUAGES,
  initAsync: false,
  // React fa già l'escape dei testi.
  interpolation: { escapeValue: false },
});

export function currentLanguage(): Language {
  const language = i18n.resolvedLanguage ?? i18n.language;
  return isLanguage(language) ? language : FALLBACK_LANGUAGE;
}

/** Locale di Intl della lingua attuale: "en-GB" o "it-IT". */
export function intlLocale(): string {
  return INTL_LOCALES[currentLanguage()];
}

function syncDocument(): void {
  document.documentElement.lang = currentLanguage();
}

syncDocument();
i18n.on("languageChanged", syncDocument);

export function applyLanguage(language: Language): void {
  void i18n.changeLanguage(language);
}

export { i18n };
