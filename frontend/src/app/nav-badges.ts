import { useBudgets } from "@/features/budgets/queries";
import { useRecurring } from "@/features/recurring/queries";

export interface NavBadge {
  count: number;
  /** Testo per i lettori di schermo, es. "2 budget oltre la soglia". */
  label: string;
  tone: "alert" | "info";
}

/** Contatori accanto alle voci di menu: avvisi dei budget, ricorrenze da confermare. */
export function useNavBadges(): Map<string, NavBadge> {
  const budgets = useBudgets();
  const recurring = useRecurring();
  const badges = new Map<string, NavBadge>();
  const alerts = budgets.data ? budgets.data.warning_count + budgets.data.over_count : 0;
  if (alerts > 0) {
    badges.set("/budget", {
      count: alerts,
      label: `${String(alerts)} budget oltre la soglia`,
      tone: "alert",
    });
  }
  const suggested = recurring.data?.summary.suggested_count ?? 0;
  if (suggested > 0) {
    badges.set("/ricorrenze", {
      count: suggested,
      label: `${String(suggested)} ricorrenze da confermare`,
      tone: "info",
    });
  }
  return badges;
}
