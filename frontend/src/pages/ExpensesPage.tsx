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
        <EmptyState icon={Wallet} title="Spese non disponibili">
          Il backend non risponde. Avvialo e riprova.
        </EmptyState>
      </Card>
    );
  }

  const total = Number(data?.total_eur ?? 0);
  const previous = data?.previous_period;
  const previousLabel = previous
    ? formatRange({ from: previous.date_from, to: previous.date_to })
    : "periodo precedente";

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
            {formatCount(data.unclassified_count)} movimenti da classificare
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label="Spese reali"
          icon={Wallet}
          value={data ? <Money value={data.total_eur} /> : undefined}
          delta={
            data ? (
              <span className="flex flex-wrap items-center gap-1">
                <Delta current={total} previous={Number(data.previous_total_eur)} />
                <span>vs {previousLabel}</span>
              </span>
            ) : undefined
          }
          pendingNote="Caricamento…"
        />
        <StatTile
          label="Media mensile"
          icon={ChartPie}
          value={data?.averages.m3 ? <Money value={data.averages.m3} /> : undefined}
          delta={
            data ? (
              <span>
                ultimi 3 mesi interi
                {data.averages.m6 && (
                  <>
                    {" "}
                    · 6 mesi <Money value={data.averages.m6} />
                  </>
                )}
                {data.averages.m12 && (
                  <>
                    {" "}
                    · 12 mesi <Money value={data.averages.m12} />
                  </>
                )}
              </span>
            ) : undefined
          }
          pendingNote={data ? "Serve almeno un mese intero di dati" : "Caricamento…"}
        />
        <StatTile
          label="Abbonamenti al mese"
          icon={Repeat}
          value={
            data?.subscriptions_monthly_eur ? (
              <Money value={data.subscriptions_monthly_eur} />
            ) : undefined
          }
          delta={
            data?.subscriptions_source === "recurring" ? (
              <Link to="/ricorrenze" className="hover:text-foreground hover:underline">
                dalle ricorrenze confermate
              </Link>
            ) : (
              "media degli ultimi 3 mesi"
            )
          }
          pendingNote={data ? "Nessun abbonamento negli ultimi mesi" : "Caricamento…"}
        />
        <StatTile
          label="Spostati e investiti"
          icon={TrendingUp}
          value={data ? <Money value={data.invested_eur} /> : undefined}
          delta="versamenti netti a Trading 212, non sono spese"
          pendingNote="Caricamento…"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Per categoria</CardTitle>
            <CardDescription>
              Confronto con {previousLabel} (stessi giorni). Tocca una categoria per il dettaglio.
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
              <EmptyState icon={PiggyBank} title="Nessuna spesa nel periodo" className="py-6" />
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
            <CardTitle>Composizione</CardTitle>
            <CardDescription>Le categorie principali del periodo</CardDescription>
          </CardHeader>
          <CardContent className={cn(expenses.isFetching && "opacity-60 transition-opacity")}>
            {!data || !monthly.data ? (
              <Skeleton className="mx-auto aspect-square w-full max-w-60 rounded-full" />
            ) : total > 0 ? (
              <CategoryDonut categories={data.categories} colors={colors} total={total} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nessuna spesa nel periodo
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Andamento mensile</CardTitle>
            <CardDescription>Spese reali per mese e categoria, con la media mobile</CardDescription>
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
            <CardTitle>Merchant</CardTitle>
            <CardDescription>Dove spendi di più nel periodo</CardDescription>
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
            <CardTitle>Prossimi addebiti</CardTitle>
            <CardDescription>Spese ricorrenti nei prossimi 30 giorni</CardDescription>
            <CardAction>
              <Link
                to="/ricorrenze"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Ricorrenze
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {upcoming.data ? (
              <UpcomingList
                items={upcoming.data.filter((u) => u.kind !== "investment_transfer")}
                lookups={lookups}
                limit={8}
                emptyText="Nessun addebito ricorrente atteso"
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
