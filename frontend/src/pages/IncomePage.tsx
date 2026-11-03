import { Coins, HandCoins, PiggyBank, Scale, Wallet } from "lucide-react";
import { useState } from "react";
import { Trans } from "react-i18next";
import { Link } from "react-router";

import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { StatTile } from "@/components/common/StatTile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Delta } from "@/features/analytics/components/CategoryBreakdown";
import { IncomeList } from "@/features/analytics/components/IncomeList";
import { IncomeVsExpensesChart } from "@/features/analytics/components/IncomeVsExpensesChart";
import { MonthsToggle } from "@/features/analytics/components/MonthsToggle";
import { useIncome, useMonthly, type IncomeSummary } from "@/features/analytics/queries";
import { UpcomingList } from "@/features/recurring/components/UpcomingList";
import { useUpcoming } from "@/features/recurring/queries";
import { transactionsUrl } from "@/features/transactions/filters";
import { useLookups } from "@/features/transactions/lookups";
import { formatCount, formatPercent } from "@/lib/format";
import { formatRange, periodLabel, resolvePeriod } from "@/lib/period";
import { usePeriod } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { i18n } from "@/i18n";

/** Sotto −100% (es. a inizio mese, prima dello stipendio) il tasso non dice nulla. */
const MIN_MEANINGFUL_RATE = -100;

function TypeBreakdown({ data }: { data: IncomeSummary }) {
  const total = Number(data.total_eur);
  if (data.by_type.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{i18n.t("income.noIncome")}</p>;
  }
  const max = Math.max(...data.by_type.map((t) => Number(t.total_eur)), 1);
  return (
    <ul className="space-y-3">
      {data.by_type.map((t) => {
        const value = Number(t.total_eur);
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">
                {t.label}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {formatCount(t.count)} · {total > 0 ? formatPercent(value / total) : "—"}
                </span>
              </span>
              <Money value={t.total_eur} className="num" />
            </span>
            <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-chart-1/70"
                style={{ width: `${String(Math.max(0, (value / max) * 100))}%` }}
              />
            </span>
          </>
        );
        return (
          <li key={t.code}>
            {t.income_type_id !== null ? (
              <Link
                to={transactionsUrl({ kind: "income", incomeType: t.income_type_id })}
                className="block rounded-lg p-1.5 hover:bg-accent/40"
              >
                {content}
              </Link>
            ) : (
              <div className="p-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function IncomePage() {
  const [period] = usePeriod();
  const range = resolvePeriod(period);
  const lookups = useLookups();
  const [months, setMonths] = useState(12);
  const income = useIncome(range);
  const monthly = useMonthly(12);
  const expected = useUpcoming({ days: 35, direction: "in", includeSuggested: true });
  const data = income.data;

  if (income.isError) {
    return (
      <Card>
        <EmptyState icon={Wallet} title={i18n.t("income.unavailable")}>
          {i18n.t("analytics.backendDown")}
        </EmptyState>
      </Card>
    );
  }

  const savingsRate = data?.savings_rate_pct ?? null;
  const previousLabel = data
    ? formatRange({ from: data.previous_period.date_from, to: data.previous_period.date_to })
    : "";

  return (
    <div className="space-y-4 lg:space-y-6">
      <p className="text-sm text-muted-foreground">
        {periodLabel(period)} · {formatRange(range)}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label={i18n.t("analytics.income")}
          icon={HandCoins}
          value={data ? <Money value={data.total_eur} /> : undefined}
          delta={
            data ? (
              <span className="flex flex-wrap items-center gap-1">
                <Delta
                  current={Number(data.total_eur)}
                  previous={Number(data.previous_total_eur)}
                />
                <span>{i18n.t("analytics.versus", { label: previousLabel })}</span>
              </span>
            ) : undefined
          }
          pendingNote={i18n.t("analytics.loading")}
        />
        <StatTile
          label={i18n.t("income.savingsRate")}
          icon={PiggyBank}
          value={
            savingsRate !== null && savingsRate >= MIN_MEANINGFUL_RATE
              ? formatPercent(savingsRate / 100)
              : undefined
          }
          delta={
            data ? (
              <span>
                <Trans
                  i18nKey="income.saved"
                  components={{
                    saved: <Money value={data.savings_eur} signed />,
                    spent: <Money value={data.expenses_eur} />,
                  }}
                />
              </span>
            ) : undefined
          }
          pendingNote={
            !data
              ? i18n.t("analytics.loading")
              : savingsRate === null
                ? i18n.t("income.noIncome")
                : i18n.t("income.tooShort")
          }
        />
        <StatTile
          label={i18n.t("analytics.averages.title")}
          icon={Scale}
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
          label={i18n.t("income.dividends")}
          icon={Coins}
          value={data ? <Money value={data.dividends_eur} /> : undefined}
          delta={i18n.t("income.dividendsNote")}
          pendingNote={i18n.t("analytics.loading")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>{i18n.t("income.versusExpenses")}</CardTitle>
              <CardDescription>{i18n.t("income.versusExpensesDescription")}</CardDescription>
            </div>
            <MonthsToggle value={months} onChange={setMonths} options={[6, 12]} />
          </CardHeader>
          <CardContent>
            {monthly.data ? (
              <IncomeVsExpensesChart months={monthly.data.months.slice(-months)} />
            ) : (
              <Skeleton className="h-72 w-full" />
            )}
          </CardContent>
        </Card>
        <div className="space-y-4 lg:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{i18n.t("income.byType")}</CardTitle>
              <CardDescription>{i18n.t("income.byTypeDescription")}</CardDescription>
            </CardHeader>
            <CardContent className={cn(income.isFetching && "opacity-60 transition-opacity")}>
              {data ? <TypeBreakdown data={data} /> : <Skeleton className="h-48 w-full" />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{i18n.t("income.expected")}</CardTitle>
              <CardDescription>{i18n.t("income.expectedDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {expected.data ? (
                <UpcomingList
                  items={expected.data}
                  lookups={lookups}
                  emptyText={i18n.t("income.expectedEmpty")}
                />
              ) : (
                <Skeleton className="h-24 w-full" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{i18n.t("income.list")}</CardTitle>
          <CardDescription>{i18n.t("income.listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <IncomeList range={range} lookups={lookups} />
        </CardContent>
      </Card>
    </div>
  );
}
