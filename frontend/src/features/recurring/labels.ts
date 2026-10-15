import type { Recurring } from "./queries";

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

export const FREQUENCY_LABELS: Record<Exclude<Frequency, "custom">, string> = {
  weekly: "Ogni settimana",
  monthly: "Ogni mese",
  quarterly: "Ogni 3 mesi",
  yearly: "Ogni anno",
};

/** "Ogni mese", "Ogni 14 giorni", ... */
export function frequencyLabel(frequency: string, intervalDays: number | null): string {
  if (frequency === "custom") {
    return intervalDays === 14 ? "Ogni 2 settimane" : `Ogni ${String(intervalDays ?? "?")} giorni`;
  }
  return frequency in FREQUENCY_LABELS
    ? FREQUENCY_LABELS[frequency as Exclude<Frequency, "custom">]
    : frequency;
}

/** Suffisso breve dopo l'importo: "/mese", "/anno", ... */
export function perPeriodSuffix(frequency: string, intervalDays: number | null): string {
  switch (frequency) {
    case "weekly":
      return "/sett.";
    case "monthly":
      return "/mese";
    case "quarterly":
      return "/trim.";
    case "yearly":
      return "/anno";
    default:
      return intervalDays ? `/${String(intervalDays)} gg` : "";
  }
}

export function confidenceLabel(confidence: number | null): string | null {
  if (confidence === null) return null;
  if (confidence >= 0.85) return "Molto regolare";
  if (confidence >= 0.65) return "Abbastanza regolare";
  return "Poco regolare";
}

export function isIncome(item: Pick<Recurring, "direction">): boolean {
  return item.direction === "in";
}
