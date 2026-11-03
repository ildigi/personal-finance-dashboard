/**
 * Periodi del selettore globale. Le date sono stringhe "YYYY-MM-DD" (come le date
 * contabili dell'API) calcolate nel fuso Europe/Rome.
 */

import { i18n } from "@/i18n";

import { formatDate, TIME_ZONE } from "./format";

export const PERIOD_PRESETS = [
  "this_month",
  "last_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "year_to_date",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface DateRange {
  from: string;
  to: string;
}

export const periodLabel = (preset: PeriodPreset): string => i18n.t(`period.labels.${preset}`);

/** Etichetta breve per gli schermi stretti. */
export const periodShortLabel = (preset: PeriodPreset): string => i18n.t(`period.short.${preset}`);

export function isPeriodPreset(value: unknown): value is PeriodPreset {
  return typeof value === "string" && (PERIOD_PRESETS as readonly string[]).includes(value);
}

/** Data di oggi a Roma, indipendente dal fuso del dispositivo. */
export function todayInRome(now: Date = new Date()): string {
  // en-CA formatta come YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined)
    throw new Error(`Data non valida: ${iso}`);
  return [y, m, d];
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Primo giorno del mese spostato di `offset` mesi (offset negativo = indietro). */
function monthStart(year: number, month: number, offset: number): string {
  const index = year * 12 + (month - 1) + offset;
  return iso(Math.floor(index / 12), (index % 12) + 1, 1);
}

function monthEnd(year: number, month: number, offset: number): string {
  const [y, m] = parts(monthStart(year, month, offset + 1));
  const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const [ey, em] = parts(monthStart(year, month, offset));
  return iso(ey, em, lastDay);
}

/**
 * Intervallo di un preset. "Ultimi N mesi" comprende il mese corrente:
 * a ottobre, "Ultimi 3 mesi" va dal 1° agosto a oggi.
 */
export function resolvePeriod(preset: PeriodPreset, today: string = todayInRome()): DateRange {
  const [y, m] = parts(today);
  switch (preset) {
    case "this_month":
      return { from: monthStart(y, m, 0), to: today };
    case "last_month":
      return { from: monthStart(y, m, -1), to: monthEnd(y, m, -1) };
    case "last_3_months":
      return { from: monthStart(y, m, -2), to: today };
    case "last_6_months":
      return { from: monthStart(y, m, -5), to: today };
    case "last_12_months":
      return { from: monthStart(y, m, -11), to: today };
    case "year_to_date":
      return { from: iso(y, 1, 1), to: today };
  }
}

/** "1–5 ott 2026", "1 ago – 5 ott 2026", "1 dic 2025 – 5 ott 2026". */
export function formatRange({ from, to }: DateRange): string {
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  if (fy === ty && fm === tm) {
    const [, , fd] = parts(from);
    return from === to ? formatDate(to) : `${String(fd)}–${formatDate(to)}`;
  }
  if (fy === ty) return `${formatDate(from, "short")} – ${formatDate(to)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}
