import { useMemo } from "react";

import type { MonthPoint } from "./queries";

/** Slot della palette categoriale (validata per daltonismo in chiaro e scuro, vedi index.css). */
export const SERIES_SLOTS = 7;
export const OTHER_COLOR = "var(--chart-ink-muted)";
export const OTHER_KEY = "altre";

export interface CategoryColors {
  /** Categorie con un colore proprio, in ordine di spesa sugli ultimi 12 mesi. */
  named: number[];
  /** `null` = movimenti da classificare: sempre nel grigio di "Altre". */
  colorOf: (categoryId: number | null) => string;
  isNamed: (categoryId: number | null) => boolean;
}

/**
 * Il colore segue la categoria, non la sua posizione nel periodo scelto: le 7 categorie
 * con più spesa negli ultimi 12 mesi hanno un colore fisso, le altre confluiscono in
 * "Altre" (grigio). Così cambiare periodo non ridipinge i grafici.
 */
export function useCategoryColors(
  months: MonthPoint[] | undefined,
  excluded: ReadonlySet<number>,
): CategoryColors {
  return useMemo(() => {
    const totals = new Map<number, number>();
    for (const month of months ?? []) {
      for (const c of month.categories) {
        if (c.category_id === null) continue;
        totals.set(c.category_id, (totals.get(c.category_id) ?? 0) + Number(c.total_eur));
      }
    }
    const named = [...totals.entries()]
      .filter(([id, total]) => total > 0 && !excluded.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, SERIES_SLOTS)
      .map(([id]) => id);
    const slot = new Map(named.map((id, index) => [id, index + 1]));
    return {
      named,
      colorOf: (id) => {
        const n = id === null ? undefined : slot.get(id);
        return n ? `var(--chart-${String(n)})` : OTHER_COLOR;
      },
      isNamed: (id) => id !== null && slot.has(id),
    };
  }, [months, excluded]);
}
