import { CalendarClock, PiggyBank } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UpcomingList } from "@/features/recurring/components/UpcomingList";
import { useUpcoming } from "@/features/recurring/queries";
import { useLookups } from "@/features/transactions/lookups";
import { formatCount } from "@/lib/format";

import { useBudgets } from "../queries";
import { BudgetMiniList } from "./BudgetMiniList";

function MoreLink({ to, children }: { to: string; children: string }) {
  return (
    <CardAction>
      <Link to={to} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
        {children}
      </Link>
    </CardAction>
  );
}

/** Panoramica: i budget del mese, i più a rischio per primi. */
export function BudgetOverviewCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const budgets = useBudgets();
  const data = budgets.data;
  const alerts = data ? data.warning_count + data.over_count : 0;
  const atRisk = data ? data.items.filter((i) => i.level === "ok" && i.projected_over).length : 0;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PiggyBank aria-hidden className="size-4 text-muted-foreground" />
          {t("planningCards.budgets.title")}
        </CardTitle>
        <CardDescription>
          {!data
            ? t("planningCards.budgets.fallback")
            : alerts > 0
              ? t("planningCards.budgets.alerts", { n: formatCount(alerts) })
              : atRisk > 0
                ? t("planningCards.budgets.atRisk", { n: formatCount(atRisk) })
                : data.items.length > 0
                  ? t("planningCards.budgets.allBelow")
                  : t("planningCards.budgets.none")}
        </CardDescription>
        <MoreLink to="/budget">{t("planningCards.budgets.more")}</MoreLink>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-32 w-full" />
        ) : data.items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {t("planningCards.budgets.emptyHint")}{" "}
            <Link to="/budget" className="text-foreground underline-offset-4 hover:underline">
              {t("planningCards.budgets.create")}
            </Link>
          </p>
        ) : (
          <BudgetMiniList items={data.items} />
        )}
      </CardContent>
    </Card>
  );
}

/** Panoramica: prossimi addebiti ricorrenti (confermati). */
export function UpcomingChargesCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const lookups = useLookups();
  const upcoming = useUpcoming({ days: 14, direction: "out" });
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
          {t("planningCards.upcoming.title")}
        </CardTitle>
        <CardDescription>{t("planningCards.upcoming.description")}</CardDescription>
        <MoreLink to="/ricorrenze">{t("planningCards.upcoming.more")}</MoreLink>
      </CardHeader>
      <CardContent>
        {upcoming.data ? (
          <UpcomingList
            items={upcoming.data}
            lookups={lookups}
            limit={6}
            emptyText={t("planningCards.upcoming.empty")}
          />
        ) : (
          <Skeleton className="h-32 w-full" />
        )}
      </CardContent>
    </Card>
  );
}
