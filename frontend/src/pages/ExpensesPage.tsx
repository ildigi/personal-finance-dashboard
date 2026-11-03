import { ChartPie, CircleDashed, PiggyBank, Repeat, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { StatTile } from "@/components/common/StatTile";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategoryColors } from "@/features/analytics/colors";
import { CategoryBreakdown, Delta } from "@/features/analytics/components/CategoryBreakdown";
import { CategoryDonut } from "@/features/analytics/components/CategoryDonut";
import { MerchantRanking } from "@/features/analytics/components/MerchantRanking";
import { MonthlyTrendChart } from "@/features/analytics/components/MonthlyTrendChart";
import { MonthsToggle } from "@/features/analytics/components/MonthsToggle";
import { useExpenses, useMerchantRanking, useMonthly } from "@/features/analytics/queries";
import { UpcomingList } from "@/features/recurring/components/UpcomingList";
import { useUpcoming } from "@/features/recurring/queries";
import { transactionsUrl } from "@/features/transactions/filters";
import { useLookups } from "@/features/transactions/lookups";
import { formatCount } from "@/lib/format";
import { formatRange, periodLabel, resolvePeriod } from "@/lib/period";
import { usePeriod } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { i18n } from "@/i18n";

export function ExpensesPage() {
  const [period] = usePeriod();
  const range = resolvePeriod(period);
  const lookups = useLookups();
  const [months, setMonths] = useState(12);
  const expenses = useExpenses(range);
  const monthly = useMonthly(12);
  const merchants = useMerchantRanking(range);
  const upcoming = useUpcoming({ days: 30, direction: "out", includeSuggested: true });

  // Colori fissi calcolati sugli ultimi 12 mesi (indipendenti dal periodo e dal selettore 6/12).
  const excluded = useMemo(
    () => new Set(lookups.categories.filter((c) => c.excluded_from_spending).map((c) => c.id)),
    [lookups.categories],
  );
  const colors = useCategoryColors(monthly.data?.months, excluded);
  const data = expenses.data;

  if (expenses.isError) {
    return (
      <Card>
        <EmptyState icon={Wallet} title={i18n.t("expenses.unavailable")}>
          {i18n.t("analytics.backendDown")}
        </EmptyState>
      </Card>
    );
  }

  const total = Number(data?.total_eur ?? 0);
  const previous = data?.previous_period;
  const previousLabel = previous
    ? formatRange({ from: previous.date_from, to: previous.date_to })
    : i18n.t("expenses.previousPeriod");

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {periodLabel(period)} · {formatRange(range)}
        </p>
        {data && data.unclassified_count > 0 && (
          <Link
            to={transactionsUrl({ uncategorized: true })}
            className="inline-flex items-center gap-1.5 self-start rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <CircleDashed aria-hidden className="size-3.5" />
            {i18n.t("expenses.unclassified", {
              count: data.unclassified_count,
              n: formatCount(data.unclassified_count),
            })}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label={i18n.t("analytics.realExpenses")}
          icon={Wallet}
          value={data ? <Money value={data.total_eur} /> : undefined}
          delta={
            data ? (
              <span className="flex flex-wrap items-center gap-1">
                <Delta current={total} previous={Number(data.previous_total_eur)} />
                <span>{i18n.t("analytics.versus", { label: previousLabel })}</span>
              </span>
            ) : undefined
          }
          pendingNote={i18n.t("analytics.loading")}
        />
        <StatTile
          label={i18n.t("analytics.averages.title")}
          icon={ChartPie}
          value={data?.averages.m3 ? <Money value={data.averages.m3} /> : undefined}
          delta={
            data ? (
              <span>
                {i18n.t("analytics.averages.last3")}
                {data.averages.m6 && (
                  <>
                    {" "}
                    · {i18n.t("analytics.averages.m6")} <Money value={data.averages.m6} />
                  </>
                )}
                {data.averages.m12 && (
                  <>
                    {" "}
                    · {i18n.t("analytics.averages.m12")} <Money value={data.averages.m12} />
                  </>
                )}
              </span>
            ) : undefined
          }
          pendingNote={data ? i18n.t("analytics.averages.needMonth") : i18n.t("analytics.loading")}
        />
        <StatTile
          label={i18n.t("expenses.subscriptions")}
          icon={Repeat}
          value={
            data?.subscriptions_monthly_eur ? (
              <Money value={data.subscriptions_monthly_eur} />
            ) : undefined
          }
          delta={
            data?.subscriptions_source === "recurring" ? (
              <Link to="/ricorrenze" className="hover:text-foreground hover:underline">
                {i18n.t("expenses.fromRecurring")}
              </Link>
            ) : (
              i18n.t("expenses.average3Months")
            )
          }
          pendingNote={data ? i18n.t("expenses.noSubscriptions") : i18n.t("analytics.loading")}
        />
        <StatTile
          label={i18n.t("expenses.invested")}
          icon={TrendingUp}
          value={data ? <Money value={data.invested_eur} /> : undefined}
          delta={i18n.t("expenses.investedNote")}
          pendingNote={i18n.t("analytics.loading")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{i18n.t("expenses.byCategory")}</CardTitle>
            <CardDescription>
              {i18n.t("expenses.byCategoryDescription", { previous: previousLabel })}
            </CardDescription>
          </CardHeader>
          <CardContent className={cn(expenses.isFetching && "opacity-60 transition-opacity")}>
            {!data ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : data.categories.length === 0 ? (
              <EmptyState icon={PiggyBank} title={i18n.t("expenses.noExpenses")} className="py-6" />
            ) : (
              <CategoryBreakdown
                categories={data.categories}
                colors={colors}
                previousLabel={previousLabel}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{i18n.t("expenses.composition")}</CardTitle>
            <CardDescription>{i18n.t("expenses.compositionDescription")}</CardDescription>
          </CardHeader>
          <CardContent className={cn(expenses.isFetching && "opacity-60 transition-opacity")}>
            {!data || !monthly.data ? (
              <Skeleton className="mx-auto aspect-square w-full max-w-60 rounded-full" />
            ) : total > 0 ? (
              <CategoryDonut categories={data.categories} colors={colors} total={total} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {i18n.t("expenses.noExpenses")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{i18n.t("expenses.trend")}</CardTitle>
            <CardDescription>{i18n.t("expenses.trendDescription")}</CardDescription>
          </div>
          <MonthsToggle value={months} onChange={setMonths} options={[6, 12]} />
        </CardHeader>
        <CardContent>
          {monthly.data ? (
            <MonthlyTrendChart
              months={monthly.data.months.slice(-months)}
              colors={colors}
              categoryById={lookups.categoryById}
            />
          ) : (
            <Skeleton className="h-80 w-full" />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{i18n.t("expenses.merchants")}</CardTitle>
            <CardDescription>{i18n.t("expenses.merchantsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className={cn(merchants.isFetching && "opacity-60 transition-opacity")}>
            {merchants.data ? (
              <MerchantRanking rows={merchants.data} lookups={lookups} />
            ) : (
              <Skeleton className="h-60 w-full" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{i18n.t("expenses.upcoming")}</CardTitle>
            <CardDescription>{i18n.t("expenses.upcomingDescription")}</CardDescription>
            <CardAction>
              <Link
                to="/ricorrenze"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {i18n.t("expenses.recurringLink")}
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {upcoming.data ? (
              <UpcomingList
                items={upcoming.data.filter((u) => u.kind !== "investment_transfer")}
                lookups={lookups}
                limit={8}
                emptyText={i18n.t("expenses.upcomingEmpty")}
              />
            ) : (
              <Skeleton className="h-60 w-full" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
