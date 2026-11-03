import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useExpenses } from "@/features/analytics/queries";
import { CONSENT_WARNING_DAYS, consentDaysLeft } from "@/features/banks/queries";
import { useBudgets } from "@/features/budgets/queries";
import { useRecurring } from "@/features/recurring/queries";
import { useSources } from "@/features/sync/queries";
import { transactionsUrl } from "@/features/transactions/filters";
import { formatCount } from "@/lib/format";
import { resolvePeriod } from "@/lib/period";
import { cn } from "@/lib/utils";

interface Alert {
  key: string;
  level: "critical" | "warning";
  text: string;
  to: string;
  action: string;
}

const ICONS: Record<Alert["level"], LucideIcon> = {
  critical: CircleAlert,
  warning: TriangleAlert,
};

/** Tutto quello che chiede un'azione, in un posto solo: prima i problemi, poi gli avvisi. */
export function AlertsCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  /** Conteggio per il plurale e numero formattato nella frase. */
  const n = (count: number) => ({ count, n: formatCount(count) });
  const sources = useSources();
  const budgets = useBudgets();
  const recurring = useRecurring();
  const expenses = useExpenses(resolvePeriod("this_month"));
  const loading = sources.isPending || budgets.isPending || recurring.isPending;

  const alerts: Alert[] = [];
  for (const s of sources.data ?? []) {
    if (s.status === "error") {
      alerts.push({
        key: `sync-${String(s.id)}`,
        level: "critical",
        text: t("alerts.syncFailed", { name: s.display_name }),
        to: "/impostazioni",
        action: t("alerts.actions.view"),
      });
    }
    if (s.provider !== "enablebanking") continue;
    const days = s.consent_expires_at ? consentDaysLeft(s.consent_expires_at) : null;
    if (s.status === "expired" || (days !== null && days < 0)) {
      alerts.push({
        key: `consent-${String(s.id)}`,
        level: "critical",
        text: t("alerts.consentExpired", { bank: s.institution }),
        to: "/impostazioni",
        action: t("alerts.actions.renew"),
      });
    } else if (days !== null && days <= CONSENT_WARNING_DAYS) {
      alerts.push({
        key: `consent-${String(s.id)}`,
        level: "warning",
        text: t("alerts.consentExpiring", { bank: s.institution, ...n(days) }),
        to: "/impostazioni",
        action: t("alerts.actions.renew"),
      });
    }
  }
  const b = budgets.data;
  if (b && b.over_count > 0) {
    alerts.push({
      key: "budget-over",
      level: "critical",
      text: t("alerts.budgetOver", n(b.over_count)),
      to: "/budget",
      action: t("alerts.actions.budget"),
    });
  }
  if (b && b.warning_count > b.over_count) {
    alerts.push({
      key: "budget-warning",
      level: "warning",
      text: t("alerts.budgetWarning", n(b.warning_count - b.over_count)),
      to: "/budget",
      action: t("alerts.actions.budget"),
    });
  }
  const r = recurring.data?.summary;
  if (r && r.late_count > 0) {
    alerts.push({
      key: "recurring-late",
      level: "warning",
      text: t("alerts.recurringLate", n(r.late_count)),
      to: "/ricorrenze",
      action: t("alerts.actions.recurring"),
    });
  }
  if (r && r.suggested_count > 0) {
    alerts.push({
      key: "recurring-suggested",
      level: "warning",
      text: t("alerts.recurringSuggested", n(r.suggested_count)),
      to: "/ricorrenze",
      action: t("alerts.actions.confirm"),
    });
  }
  const unclassified = expenses.data?.unclassified_count ?? 0;
  if (unclassified > 0) {
    alerts.push({
      key: "unclassified",
      level: "warning",
      text: t("alerts.unclassified", n(unclassified)),
      to: transactionsUrl({ uncategorized: true }),
      action: t("alerts.actions.classify"),
    });
  }
  alerts.sort((x, y) => Number(x.level === "warning") - Number(y.level === "warning"));

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("alerts.title")}</CardTitle>
        <CardDescription>{t("alerts.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : alerts.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck aria-hidden className="size-4 text-status-good" />
            {t("alerts.allGood")}
          </p>
        ) : (
          <ul className="divide-y">
            {alerts.map((a) => {
              const Icon = ICONS[a.level];
              return (
                <li key={a.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0",
                      a.level === "critical" ? "text-status-critical" : "text-status-warning",
                    )}
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="sr-only">
                      {a.level === "critical" ? "Problema: " : "Avviso: "}
                    </span>
                    {a.text}
                  </span>
                  <Link
                    to={a.to}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    {a.action}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
