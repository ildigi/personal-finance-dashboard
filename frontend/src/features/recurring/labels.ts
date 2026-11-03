import { i18n } from "@/i18n";

import type { Recurring } from "./queries";

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

export const FIXED_FREQUENCIES: Exclude<Frequency, "custom">[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

const isFixed = (frequency: string): frequency is Exclude<Frequency, "custom"> =>
  (FIXED_FREQUENCIES as string[]).includes(frequency);

/** "Ogni mese", "Ogni 14 giorni", ... */
export function frequencyLabel(frequency: string, intervalDays: number | null): string {
  if (frequency === "custom") {
    return intervalDays === 14
      ? i18n.t("recurring.frequency.biweekly")
      : i18n.t("recurring.frequency.everyDays", { n: intervalDays ?? "?" });
  }
  return isFixed(frequency) ? i18n.t(`recurring.frequency.${frequency}`) : frequency;
}

/** Suffisso breve dopo l'importo: "/mese", "/anno", ... */
export function perPeriodSuffix(frequency: string, intervalDays: number | null): string {
  if (isFixed(frequency)) return i18n.t(`recurring.perPeriod.${frequency}`);
  return intervalDays ? i18n.t("recurring.perPeriod.days", { n: intervalDays }) : "";
}

export function confidenceLabel(confidence: number | null): string | null {
  if (confidence === null) return null;
  if (confidence >= 0.85) return i18n.t("recurring.confidence.high");
  if (confidence >= 0.65) return i18n.t("recurring.confidence.medium");
  return i18n.t("recurring.confidence.low");
}

export function isIncome(item: Pick<Recurring, "direction">): boolean {
  return item.direction === "in";
}
