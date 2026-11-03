import { ArrowLeftRight, CircleDashed, HandCoins, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CategoryIcon } from "@/components/common/CategoryIcon";
import { cn } from "@/lib/utils";

import type { TransactionKind } from "../labels";
import type { Lookups } from "../lookups";

/**
 * Cosa è un movimento, in breve: "Trasporti › Treno" con icona per le spese,
 * la tipologia per le entrate, "Tra i tuoi conti" per i giroconti, oppure
 * "Da classificare" ben visibile.
 */
export function CategoryLabel({
  categoryId,
  subcategoryId,
  kind,
  incomeTypeId,
  lookups,
  className,
}: {
  categoryId: number | null;
  subcategoryId: number | null;
  kind?: TransactionKind;
  incomeTypeId?: number | null;
  lookups: Lookups;
  className?: string;
}) {
  const { t } = useTranslation();
  const category = categoryId !== null ? lookups.categoryById.get(categoryId) : undefined;
  if (!category) {
    const income =
      kind === "income" && incomeTypeId != null
        ? lookups.incomeTypeById.get(incomeTypeId)
        : undefined;
    const plain = income
      ? { icon: HandCoins, text: income.label }
      : kind === "internal_transfer"
        ? { icon: ArrowLeftRight, text: t("transactions.betweenAccounts") }
        : kind === "investment_transfer"
          ? { icon: TrendingUp, text: t("transactions.investments") }
          : null;
    if (plain) {
      const Icon = plain.icon;
      return (
        <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-sm", className)}>
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{plain.text}</span>
        </span>
      );
    }
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-dashed px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground",
          className,
        )}
      >
        <CircleDashed aria-hidden className="size-3" />
        {t("transactions.unclassified")}
      </span>
    );
  }
  const sub = subcategoryId !== null ? lookups.subcategoryById.get(subcategoryId) : undefined;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-sm", className)}>
      <CategoryIcon name={category.icon} className="shrink-0 text-muted-foreground" />
      <span className="truncate">
        {category.name}
        {sub && <span className="text-muted-foreground"> › {sub.name}</span>}
      </span>
    </span>
  );
}
