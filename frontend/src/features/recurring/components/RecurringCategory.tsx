import { HandCoins } from "lucide-react";

import { CategoryLabel } from "@/features/transactions/components/CategoryLabel";
import type { TransactionKind } from "@/features/transactions/labels";
import type { Lookups } from "@/features/transactions/lookups";
import { cn } from "@/lib/utils";

/** Categoria di una ricorrenza; le entrate senza categoria (es. stipendio) sono "Entrata". */
export function RecurringCategory({
  item,
  lookups,
  className,
}: {
  item: { category_id: number | null; subcategory_id: number | null; kind: string };
  lookups: Lookups;
  className?: string;
}) {
  if (item.kind === "income" && item.category_id === null) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <HandCoins aria-hidden className="size-4 shrink-0" />
        Entrata
      </span>
    );
  }
  return (
    <CategoryLabel
      categoryId={item.category_id}
      subcategoryId={item.subcategory_id}
      kind={item.kind as TransactionKind}
      lookups={lookups}
      className={className}
    />
  );
}
