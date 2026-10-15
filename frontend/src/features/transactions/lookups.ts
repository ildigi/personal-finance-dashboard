import { useMemo } from "react";

import type { Account, Category, IncomeType, Schemas } from "@/api/client";
import { useAccounts, useCategories, useIncomeTypes } from "@/features/system/queries";

type Subcategory = Category["subcategories"][number];

/** Mappe id → conto/categoria/sottocategoria/tipologia per mostrare i nomi nei movimenti. */
export function useLookups() {
  const accounts = useAccounts();
  const categories = useCategories();
  const incomeTypes = useIncomeTypes();
  return useMemo(() => {
    const accountById = new Map<number, Account>((accounts.data ?? []).map((a) => [a.id, a]));
    const categoryById = new Map<number, Category>((categories.data ?? []).map((c) => [c.id, c]));
    const subcategoryById = new Map<number, Subcategory>(
      (categories.data ?? []).flatMap((c) => c.subcategories.map((s) => [s.id, s] as const)),
    );
    const incomeTypeById = new Map<number, IncomeType>(
      (incomeTypes.data ?? []).map((i) => [i.id, i]),
    );
    return {
      accounts: accounts.data ?? [],
      categories: categories.data ?? [],
      incomeTypes: incomeTypes.data ?? [],
      accountById,
      categoryById,
      subcategoryById,
      incomeTypeById,
    };
  }, [accounts.data, categories.data, incomeTypes.data]);
}

export type Lookups = ReturnType<typeof useLookups>;

export function accountLabel(account: Account | undefined): string {
  if (!account) return "Conto";
  return `${account.institution} · ${account.name}`;
}

interface Classified {
  kind: Schemas["TransactionKind"];
  category_id: number | null;
  subcategory_id: number | null;
  income_type_id: number | null;
}

/** La classificazione in parole, per elenchi compatti e lettori di schermo. */
export function describeClassification(tx: Classified, lookups: Lookups): string {
  const category = tx.category_id !== null ? lookups.categoryById.get(tx.category_id) : undefined;
  if (category) {
    const sub =
      tx.subcategory_id !== null ? lookups.subcategoryById.get(tx.subcategory_id) : undefined;
    return sub ? `${category.name} › ${sub.name}` : category.name;
  }
  if (tx.kind === "income" && tx.income_type_id !== null) {
    return lookups.incomeTypeById.get(tx.income_type_id)?.label ?? "Entrata";
  }
  if (tx.kind === "internal_transfer") return "Tra i tuoi conti";
  if (tx.kind === "investment_transfer") return "Investimenti";
  return "Da classificare";
}
