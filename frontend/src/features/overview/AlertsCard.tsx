import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
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

function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** Tutto quello che chiede un'azione, in un posto solo: prima i problemi, poi gli avvisi. */
export function AlertsCard({ className }: { className?: string }) {
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
        text: `Ultima sincronizzazione di ${s.display_name} non riuscita`,
        to: "/impostazioni",
        action: "Vedi",
      });
    }
    if (s.provider !== "enablebanking") continue;
    const days = s.consent_expires_at ? consentDaysLeft(s.consent_expires_at) : null;
    if (s.status === "expired" || (days !== null && days < 0)) {
      alerts.push({
        key: `consent-${String(s.id)}`,
        level: "critical",
        text: `Consenso di ${s.institution} scaduto: i movimenti nuovi non arrivano`,
        to: "/impostazioni",
        action: "Rinnova",
      });
    } else if (days !== null && days <= CONSENT_WARNING_DAYS) {
      alerts.push({
        key: `consent-${String(s.id)}`,
        level: "warning",
        text: `Consenso di ${s.institution} in scadenza tra ${plural(days, "giorno", "giorni")}`,
        to: "/impostazioni",
        action: "Rinnova",
      });
    }
  }
  const b = budgets.data;
  if (b && b.over_count > 0) {
    alerts.push({
      key: "budget-over",
      level: "critical",
      text: `${plural(b.over_count, "budget superato", "budget superati")} questo mese`,
      to: "/budget",
      action: "Budget",
    });
  }
  if (b && b.warning_count > b.over_count) {
    alerts.push({
      key: "budget-warning",
      level: "warning",
      text: `${plural(b.warning_count - b.over_count, "budget vicino", "budget vicini")} alla soglia`,
      to: "/budget",
      action: "Budget",
    });
  }
  const r = recurring.data?.summary;
  if (r && r.late_count > 0) {
    alerts.push({
      key: "recurring-late",
      level: "warning",
      text: `${plural(r.late_count, "addebito ricorrente", "addebiti ricorrenti")} in ritardo`,
      to: "/ricorrenze",
      action: "Ricorrenze",
    });
  }
  if (r && r.suggested_count > 0) {
    alerts.push({
      key: "recurring-suggested",
      level: "warning",
      text: `${plural(r.suggested_count, "ricorrenza", "ricorrenze")} da confermare`,
      to: "/ricorrenze",
      action: "Conferma",
    });
  }
  const unclassified = expenses.data?.unclassified_count ?? 0;
  if (unclassified > 0) {
    alerts.push({
      key: "unclassified",
      level: "warning",
      text: `${plural(unclassified, "spesa", "spese")} del mese da classificare`,
      to: transactionsUrl({ uncategorized: true }),
      action: "Classifica",
    });
  }
  alerts.sort((x, y) => Number(x.level === "warning") - Number(y.level === "warning"));

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Da sistemare</CardTitle>
        <CardDescription>Consensi, sincronizzazioni, budget e classificazione</CardDescription>
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
            Tutto in ordine: niente da sistemare.
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
