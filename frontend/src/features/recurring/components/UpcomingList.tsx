import { Clock, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Money } from "@/components/common/Money";
import type { Lookups } from "@/features/transactions/lookups";
import { formatDueDay } from "@/lib/format";
import { todayInRome } from "@/lib/period";
import { cn } from "@/lib/utils";

import type { UpcomingCharge } from "../queries";
import { RecurringCategory } from "./RecurringCategory";

/**
 * Addebiti (o accrediti) attesi dalle ricorrenze, in ordine di data. Quelli già scaduti e
 * non ancora arrivati restano in cima come "in ritardo".
 */
export function UpcomingList({
  items,
  lookups,
  limit,
  emptyText,
  className,
}: {
  items: UpcomingCharge[];
  lookups: Lookups;
  limit?: number;
  emptyText?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const today = todayInRome();
  const shown = limit ? items.slice(0, limit) : items;
  if (shown.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {emptyText ?? t("upcomingList.empty")}
      </p>
    );
  }
  return (
    <ul className={cn("divide-y", className)}>
      {shown.map((item) => (
        <li
          key={`${String(item.recurring_id)}-${item.date}`}
          className="flex items-center gap-3 py-2.5"
        >
          <div
            className={cn(
              "w-16 shrink-0 text-xs leading-tight font-medium",
              item.overdue ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {formatDueDay(item.date, today)}
          </div>
          <div className="min-w-0 flex-1">
            <Link
              to={`/ricorrenze#ricorrenza-${String(item.recurring_id)}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {item.name}
            </Link>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <RecurringCategory
                item={item}
                lookups={lookups}
                className="text-xs text-muted-foreground"
              />
              {item.overdue && (
                <span className="inline-flex items-center gap-1 text-xs font-medium">
                  <Clock aria-hidden className="size-3 text-status-serious" />{" "}
                  {t("upcomingList.late")}
                </span>
              )}
              {item.status === "suggested" && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles aria-hidden className="size-3" /> {t("upcomingList.toConfirm")}
                </span>
              )}
            </div>
          </div>
          <Money value={item.amount_eur} signed tone="auto" className="text-sm tabular-nums" />
        </li>
      ))}
    </ul>
  );
}
