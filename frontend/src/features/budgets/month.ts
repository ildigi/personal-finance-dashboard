import { todayInRome } from "@/lib/period";

/** Mese corrente "AAAA-MM" nel fuso di Roma. */
export function currentMonth(now: Date = new Date()): string {
  return todayInRome(now).slice(0, 7);
}

/** "2026-01" spostato di `delta` mesi: shiftMonth("2026-01", -1) = "2025-12". */
export function shiftMonth(month: string, delta: number): string {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export type BudgetLevel = "ok" | "warning" | "over";

/** Stato di un budget in parole (mai solo colore). */
export function budgetStatusText(budget: {
  level: BudgetLevel;
  alert_threshold_pct: number;
  remaining_eur: string;
  projected_over: boolean;
}): string {
  if (budget.level === "over") {
    return Number(budget.remaining_eur) === 0 ? "Budget esaurito" : "Budget superato";
  }
  if (budget.level === "warning") {
    return `Soglia di avviso superata (${String(budget.alert_threshold_pct)}%)`;
  }
  return budget.projected_over ? "A questo ritmo lo superi" : "In linea";
}
