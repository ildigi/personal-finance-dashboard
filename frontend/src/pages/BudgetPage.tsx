import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Gauge,
  OctagonAlert,
  PiggyBank,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { StatTile } from "@/components/common/StatTile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetCard } from "@/features/budgets/components/BudgetCard";
import {
  BudgetEditorSheet,
  type BudgetDraft,
} from "@/features/budgets/components/BudgetEditorSheet";
import { currentMonth, shiftMonth } from "@/features/budgets/month";
import { useBudgets, useDeleteBudget, type BudgetStatus } from "@/features/budgets/queries";
import { useLookups } from "@/features/transactions/lookups";
import { formatCount, formatMonth, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { i18n } from "@/i18n";

export function BudgetPage() {
  const lookups = useLookups();
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const budgets = useBudgets(month === thisMonth ? null : month);
  const remove = useDeleteBudget();
  const [draft, setDraft] = useState<BudgetDraft | null>(null);

  if (budgets.isError) {
    return (
      <Card>
        <EmptyState icon={PiggyBank} title={i18n.t("budgets.unavailable")}>
          {i18n.t("analytics.backendDown")}
        </EmptyState>
      </Card>
    );
  }

  const data = budgets.data;
  const isCurrent = month === thisMonth;
  const alerts = data ? data.items.filter((i) => i.level !== "ok") : [];
  const atRisk = data ? data.items.filter((i) => i.level === "ok" && i.projected_over) : [];
  const total = Number(data?.total_amount ?? 0);

  function onDelete(budget: BudgetStatus): void {
    const ok = window.confirm(i18n.t("budgets.deleteConfirm", { name: budget.name }));
    if (ok) remove.mutate(budget.id);
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setMonth(shiftMonth(month, -1));
            }}
            aria-label={i18n.t("budgets.previousMonth")}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <h2 className="min-w-36 text-center text-base font-medium first-letter:uppercase">
            {formatMonth(month, "long")}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isCurrent}
            onClick={() => {
              setMonth(shiftMonth(month, 1));
            }}
            aria-label={i18n.t("budgets.nextMonth")}
          >
            <ChevronRight aria-hidden />
          </Button>
          {!isCurrent && (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setMonth(thisMonth);
              }}
            >
              {i18n.t("budgets.backToCurrent")}
            </Button>
          )}
        </div>
        {isCurrent && (
          <Button
            onClick={() => {
              setDraft({ budget: null });
            }}
          >
            <Plus aria-hidden /> {i18n.t("budgets.new")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label={i18n.t("budgets.tiles.month")}
          icon={PiggyBank}
          value={data && total > 0 ? <Money value={data.total_amount} /> : undefined}
          delta={
            data
              ? i18n.t("budgets.tiles.categories", {
                  count: data.items.length,
                  n: formatCount(data.items.length),
                })
              : undefined
          }
          pendingNote={data ? i18n.t("budgets.tiles.noneThisMonth") : i18n.t("analytics.loading")}
        />
        <StatTile
          label={i18n.t("budgets.tiles.spent")}
          icon={Wallet}
          value={data && total > 0 ? <Money value={data.total_spent_eur} /> : undefined}
          delta={
            data && total > 0
              ? i18n.t("budgets.tiles.ofBudget", {
                  pct: formatPercent(Number(data.total_spent_eur) / total, { digits: 0 }),
                })
              : undefined
          }
          pendingNote={data ? "—" : "Caricamento…"}
        />
        <StatTile
          label={
            isCurrent ? i18n.t("budgets.tiles.projection") : i18n.t("budgets.tiles.monthTotal")
          }
          icon={TrendingUp}
          value={data && total > 0 ? <Money value={data.total_projected_eur} /> : undefined}
          delta={
            data && isCurrent
              ? i18n.t("budgets.tiles.day", { day: data.days_elapsed, days: data.days_in_month })
              : i18n.t("budgets.tiles.monthClosed")
          }
          pendingNote={data ? "—" : "Caricamento…"}
        />
        <StatTile
          label={i18n.t("budgets.tiles.alerts")}
          icon={Gauge}
          value={data ? formatCount(alerts.length) : undefined}
          delta={
            data
              ? alerts.length === 0
                ? atRisk.length > 0
                  ? i18n.t("budgets.tiles.atRisk", { n: formatCount(atRisk.length) })
                  : i18n.t("budgets.tiles.allBelow")
                : i18n.t("budgets.tiles.overAndWarning", {
                    over: formatCount(data.over_count),
                    warning: formatCount(data.warning_count),
                  })
              : undefined
          }
          pendingNote={i18n.t("analytics.loading")}
        />
      </div>

      {alerts.length > 0 && (
        <ul
          aria-label={i18n.t("budgets.alertsLabel")}
          className="space-y-2 rounded-xl border border-status-serious/40 bg-status-serious/5 p-4"
        >
          {alerts.map((a) => {
            const Icon = a.level === "over" ? OctagonAlert : CircleAlert;
            return (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <Icon
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0",
                    a.level === "over" ? "text-status-critical" : "text-status-serious",
                  )}
                />
                <span>
                  <span className="font-medium">{a.name}</span>:{" "}
                  {a.level === "over"
                    ? i18n.t("budgets.alertOver")
                    : i18n.t("budgets.alertThreshold", { pct: a.alert_threshold_pct })}{" "}
                  (<Money value={a.spent_eur} /> {i18n.t("budgets.alertOf")}{" "}
                  <Money value={a.amount} />)
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBank}
            title={
              isCurrent ? i18n.t("budgets.empty.title") : i18n.t("budgets.tiles.noneThisMonth")
            }
            action={
              isCurrent ? (
                <Button
                  onClick={() => {
                    setDraft({ budget: null });
                  }}
                >
                  <Plus aria-hidden /> {i18n.t("budgets.empty.createFirst")}
                </Button>
              ) : undefined
            }
          >
            {isCurrent ? i18n.t("budgets.empty.hint") : i18n.t("budgets.empty.past")}
          </EmptyState>
        </Card>
      ) : (
        <div
          className={cn(
            "grid gap-4 lg:grid-cols-2 lg:gap-6",
            budgets.isPlaceholderData && "opacity-60 transition-opacity",
          )}
        >
          {data.items.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              overview={data}
              onEdit={
                isCurrent
                  ? () => {
                      setDraft({ budget: b });
                    }
                  : undefined
              }
              onDelete={
                isCurrent
                  ? () => {
                      onDelete(b);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <BudgetEditorSheet
        draft={draft}
        lookups={lookups}
        onClose={() => {
          setDraft(null);
        }}
      />
    </div>
  );
}
