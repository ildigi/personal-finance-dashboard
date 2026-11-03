import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api, unwrap } from "@/api/client";
import { useRecurring } from "@/features/recurring/queries";
import { useRules } from "@/features/rules/queries";

import type { TransactionFilters } from "../filters";
import type { Lookups } from "../lookups";

function useMerchantName(id: number | null): string | undefined {
  const { data } = useQuery({
    queryKey: ["merchants", "detail", id],
    queryFn: () =>
      unwrap(
        api.GET("/api/merchants/{merchant_id}", { params: { path: { merchant_id: id ?? 0 } } }),
      ),
    enabled: id !== null,
  });
  return data?.name;
}

/**
 * Filtri arrivati da un collegamento (drill-down delle Spese, "vedi movimenti" di una
 * regola o di un merchant): non hanno un menu proprio, si vedono e si tolgono qui.
 */
export function LinkedFilterChips({
  filters,
  setFilter,
  lookups,
}: {
  filters: TransactionFilters;
  setFilter: <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => void;
  lookups: Lookups;
}) {
  const { t } = useTranslation();
  const merchantName = useMerchantName(filters.merchant);
  const rules = useRules();
  const recurring = useRecurring();
  const chips: {
    key: "subcategory" | "merchant" | "rule" | "recurring" | "incomeType";
    label: string;
  }[] = [];

  if (filters.subcategory !== null) {
    const sub = lookups.subcategoryById.get(filters.subcategory);
    chips.push({
      key: "subcategory",
      label: t("transactions.chips.subcategory", { name: sub?.name ?? "…" }),
    });
  }
  if (filters.merchant !== null) {
    chips.push({
      key: "merchant",
      label: t("transactions.chips.merchant", { name: merchantName ?? "…" }),
    });
  }
  if (filters.rule !== null) {
    const rule = rules.data?.find((r) => r.id === filters.rule);
    chips.push({ key: "rule", label: t("transactions.chips.rule", { name: rule?.name ?? "…" }) });
  }
  if (filters.recurring !== null) {
    const item = recurring.data?.items.find((r) => r.id === filters.recurring);
    chips.push({
      key: "recurring",
      label: t("transactions.chips.recurring", { name: item?.name ?? "…" }),
    });
  }
  if (filters.incomeType !== null) {
    const income = lookups.incomeTypeById.get(filters.incomeType);
    chips.push({
      key: "incomeType",
      label: t("transactions.chips.incomeType", { name: income?.label ?? "…" }),
    });
  }
  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label={t("transactions.chips.label")}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => {
              setFilter(chip.key, null);
            }}
            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={t("transactions.chips.remove", { label: chip.label })}
          >
            <span className="truncate">{chip.label}</span>
            <X aria-hidden className="size-3.5 shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  );
}
