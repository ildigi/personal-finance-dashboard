import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const budgets = useBudgets();
  const recurring = useRecurring();
  const badges = new Map<string, NavBadge>();
  const alerts = budgets.data ? budgets.data.warning_count + budgets.data.over_count : 0;
  if (alerts > 0) {
    badges.set("/budget", {
      count: alerts,
      label: t("nav.badges.budgetAlerts", { count: alerts }),
      tone: "alert",
    });
  }
  const suggested = recurring.data?.summary.suggested_count ?? 0;
  if (suggested > 0) {
    badges.set("/ricorrenze", {
      count: suggested,
      label: t("nav.badges.recurringSuggested", { count: suggested }),
      tone: "info",
    });
  }
  return badges;
}
