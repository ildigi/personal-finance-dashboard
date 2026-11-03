/**
 * Preferenze dell'interfaccia salvate in localStorage: tema, modalità privacy, lingua,
 * periodo globale. Solo comodità locali: nessun dato finanziario finisce qui.
 */

import { useSyncExternalStore } from "react";

import { applyLanguage } from "@/i18n";
import {
  LANGUAGE_STORAGE_KEY,
  parseLanguagePreference,
  resolveLanguage,
  type LanguagePreference,
} from "@/i18n/languages";

import { isPeriodPreset, type PeriodPreset } from "./period";

interface Store<T> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Archiviazione non disponibile (es. finestra privata): la preferenza resta in memoria.
  }
}

function createStore<T>(
  key: string,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string,
  onChange?: (value: T) => void,
): Store<T> {
  let value = parse(readStorage(key));
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      value = next;
      writeStorage(key, serialize(next));
      onChange?.(next);
      listeners.forEach((listener) => {
        listener();
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function useStore<T>(store: Store<T>): [T, (value: T) => void] {
  const value = useSyncExternalStore(store.subscribe, store.get, store.get);
  return [value, store.set];
}

// --- Tema --------------------------------------------------------------------------

export type ThemePreference = "light" | "dark" | "system";

const darkQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

export function applyTheme(preference: ThemePreference): void {
  const dark = preference === "dark" || (preference === "system" && darkQuery()?.matches === true);
  document.documentElement.classList.toggle("dark", dark);
}

export const themeStore = createStore<ThemePreference>(
  "fd-theme",
  (raw) => (raw === "light" || raw === "dark" ? raw : "system"),
  (value) => value,
  applyTheme,
);

/** Segue il tema del sistema operativo quando la preferenza è "system". */
export function watchSystemTheme(): () => void {
  const query = darkQuery();
  if (!query) return () => undefined;
  const onChange = (): void => {
    if (themeStore.get() === "system") applyTheme("system");
  };
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

export const useTheme = (): [ThemePreference, (value: ThemePreference) => void] =>
  useStore(themeStore);

// --- Privacy -----------------------------------------------------------------------

export const privacyStore = createStore<boolean>(
  "fd-privacy",
  (raw) => raw === "on",
  (value) => (value ? "on" : "off"),
  (on) => {
    if (on) document.documentElement.dataset.privacy = "on";
    else delete document.documentElement.dataset.privacy;
  },
);

export const usePrivacy = (): [boolean, (value: boolean) => void] => useStore(privacyStore);

// --- Periodo globale ------------------------------------------------------------------

export const periodStore = createStore<PeriodPreset>(
  "fd-period",
  (raw) => (isPeriodPreset(raw) ? raw : "this_month"),
  (value) => value,
);

export const usePeriod = (): [PeriodPreset, (value: PeriodPreset) => void] => useStore(periodStore);

// --- Investimenti: tutto o solo le posizioni in mano ------------------------------------

export type InvestmentScope = "all" | "active";

export const investmentScopeStore = createStore<InvestmentScope>(
  "fd-investment-scope",
  (raw) => (raw === "active" ? "active" : "all"),
  (value) => value,
);

export const useInvestmentScope = (): [InvestmentScope, (value: InvestmentScope) => void] =>
  useStore(investmentScopeStore);

// --- Lingua ---------------------------------------------------------------------------

export const languageStore = createStore<LanguagePreference>(
  LANGUAGE_STORAGE_KEY,
  parseLanguagePreference,
  (value) => value,
  (preference) => {
    applyLanguage(resolveLanguage(preference));
  },
);

export const useLanguagePreference = (): [
  LanguagePreference,
  (value: LanguagePreference) => void,
] => useStore(languageStore);
