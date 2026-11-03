import { ArrowDownRight, ArrowUpRight, ChevronRight, CircleDashed, Minus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { transactionsUrl } from "@/features/transactions/filters";
import { formatCount, formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { CategoryColors } from "../colors";
import type { CategoryTotal } from "../queries";
import { i18n } from "@/i18n";

/** Variazione rispetto al periodo precedente, in parole e con freccia (mai solo colore). */
export function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  const pct = previous !== 0 ? formatPercent(diff / Math.abs(previous), { signed: true }) : null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs whitespace-nowrap text-muted-foreground">
      <Icon aria-hidden className="size-3.5" />
      <span data-sensitive>{formatMoney(diff, "EUR", { signed: true })}</span>
      {pct && <span>({pct})</span>}
    </span>
  );
}

/**
 * Spese per categoria con barra della quota, confronto con il periodo precedente
 * (stessi giorni) e drill-down: categoria → sottocategorie → movimenti.
 * È anche la vista tabellare della ciambella.
 */
export function CategoryBreakdown({
  categories,
  colors,
  previousLabel,
}: {
  categories: CategoryTotal[];
  colors: CategoryColors;
  previousLabel: string;
}) {
  // Chiave della riga aperta: id della categoria, oppure "none" per i movimenti da classificare.
  const [open, setOpen] = useState<number | "none" | null>(null);
  const max = Math.max(...categories.map((c) => Number(c.total_eur)), 1);

  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_9.5rem] gap-3 border-b px-2 pb-2 text-xs text-muted-foreground sm:grid">
        <span>{i18n.t("analytics.category")}</span>
        <span className="text-right">{i18n.t("analytics.spent")}</span>
        <span className="text-right">{i18n.t("analytics.versus", { label: previousLabel })}</span>
      </div>
      <ul className="divide-y">
        {categories.map((c) => {
          const total = Number(c.total_eur);
          const rowKey = c.category_id ?? "none";
          const expanded = open === rowKey;
          const hasSubs = c.subcategories.length > 0;
          // Senza categoria: si va ai movimenti da sistemare.
          const allUrl =
            c.category_id === null
              ? transactionsUrl({ uncategorized: true })
              : transactionsUrl({ category: c.category_id });
          return (
            <li key={rowKey}>
              <button
                type="button"
                aria-expanded={hasSubs ? expanded : undefined}
                onClick={() => {
                  setOpen(expanded ? null : rowKey);
                }}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-2.5 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_7rem_9.5rem]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: colors.colorOf(c.category_id) }}
                  />
                  {c.category_id === null ? (
                    <CircleDashed aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <CategoryIcon name={c.icon} className="shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-medium">
                    {c.name ?? i18n.t("transactions.unclassified")}
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {i18n.t("analytics.transactionsShort", { n: formatCount(c.count) })}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      expanded && "rotate-90",
                    )}
                  />
                </span>
                <span className="text-right">
                  <Money value={c.total_eur} className="num text-sm font-medium" />
                  <span className="block text-xs text-muted-foreground sm:hidden">
                    <Delta current={total} previous={Number(c.previous_eur)} />
                  </span>
                </span>
                <span className="hidden text-right sm:block">
                  <Delta current={total} previous={Number(c.previous_eur)} />
                </span>
                {/* Barra della quota: una sola tinta per tutte le righe (la lunghezza dice già tutto). */}
                <span
                  aria-hidden
                  className="col-span-full h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className="block h-full rounded-full bg-chart-1/70"
                    style={{ width: `${String(Math.max(0, (total / max) * 100))}%` }}
                  />
                </span>
              </button>

              {expanded && (
                <div className="mb-2 ml-9 space-y-1 border-l pl-3">
                  {c.subcategories.map((s) => (
                    <Link
                      key={s.subcategory_id ?? "none"}
                      to={transactionsUrl({
                        ...(c.category_id !== null && { category: c.category_id }),
                        ...(s.subcategory_id !== null && { subcategory: s.subcategory_id }),
                      })}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
                    >
                      <span className="truncate">
                        {s.name ?? i18n.t("analytics.noSubcategory")}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {i18n.t("analytics.transactionsShort", { n: formatCount(s.count) })}
                        </span>
                      </span>
                      <Money value={s.total_eur} className="num" />
                    </Link>
                  ))}
                  <Link
                    to={allUrl}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    {c.category_id === null
                      ? i18n.t("analytics.seeUnclassified")
                      : i18n.t("analytics.seeCategory", { name: c.name ?? "" })}
                    <ChevronRight aria-hidden className="size-3.5" />
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
