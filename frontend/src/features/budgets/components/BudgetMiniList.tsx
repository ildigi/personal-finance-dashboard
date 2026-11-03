import { CircleAlert, OctagonAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { BudgetStatus } from "../queries";

const FILL = { ok: "bg-primary", warning: "bg-status-warning", over: "bg-status-critical" };
const TRACK = {
  ok: "bg-primary/15",
  warning: "bg-status-warning/20",
  over: "bg-status-critical/15",
};

/** Budget in forma compatta (Panoramica): i più a rischio per primi. */
export function BudgetMiniList({ items, limit = 5 }: { items: BudgetStatus[]; limit?: number }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-3.5">
      {items.slice(0, limit).map((b) => {
        const Icon = b.level === "over" ? OctagonAlert : b.level === "warning" ? CircleAlert : null;
        return (
          <li key={b.id}>
            <Link to="/budget" className="group block space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <CategoryIcon name={b.icon} className="shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium group-hover:underline">{b.name}</span>
                  {Icon && (
                    <Icon
                      aria-label={
                        b.level === "over" ? t("budgetMini.over") : t("budgetMini.warning")
                      }
                      className={cn(
                        "size-3.5 shrink-0",
                        b.level === "over" ? "text-status-critical" : "text-status-serious",
                      )}
                    />
                  )}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  <Money value={b.spent_eur} className="text-foreground" /> /{" "}
                  <Money value={b.amount} />
                </span>
              </div>
              <div
                role="meter"
                aria-label={t("budgetMini.meter", { name: b.name })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(b.used_pct)}
                aria-valuetext={t("budgetMini.meterValue", {
                  spent: formatMoney(b.spent_eur),
                  amount: formatMoney(b.amount),
                })}
                className={cn("h-1.5 overflow-hidden rounded-full", TRACK[b.level])}
              >
                <div
                  className={cn("h-full rounded-full", FILL[b.level])}
                  style={{ width: `${String(Math.min(b.used_pct, 100))}%` }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
