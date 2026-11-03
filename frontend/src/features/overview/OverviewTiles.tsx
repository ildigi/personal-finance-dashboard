import { ArrowDownLeft, ArrowUpRight, Landmark, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

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
import { useExpenses, useIncome } from "@/features/analytics/queries";
import { usePortfolios, useInvestmentSummary } from "@/features/investments/queries";
import { ChangeNote } from "@/features/networth/ChangeNote";
import { NetWorthChart } from "@/features/networth/NetWorthChart";
import { rangeStart, useNetWorth } from "@/features/networth/queries";
import { formatPercent } from "@/lib/format";
import { resolvePeriod, todayInRome } from "@/lib/period";

/** Ultimi tre mesi: abbastanza per vedere la tendenza, leggero da caricare. */
function useRecentNetWorth() {
  return useNetWorth(rangeStart("3m", todayInRome()));
}

/** Le quattro risposte della Panoramica: quanto ho, quanto spendo, quanto entra, quanto rendo. */
export function OverviewTiles() {
  const { t } = useTranslation();
  const range = resolvePeriod("this_month");
  const networth = useRecentNetWorth();
  const expenses = useExpenses(range);
  const income = useIncome(range);
  const portfolios = usePortfolios();
  const portfolio = portfolios.data?.find((p) => !p.is_mock) ?? portfolios.data?.[0] ?? null;
  const summary = useInvestmentSummary(portfolio?.id ?? null);

  const nw = networth.data;
  const ex = expenses.data;
  const inc = income.data;
  const ret = summary.data?.returns;

  return (
    <section
      aria-label={t("overview.tilesLabel")}
      className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
    >
      <StatTile
        label={t("overview.tiles.netWorth")}
        icon={Landmark}
        value={nw ? <Money value={nw.total_eur} /> : undefined}
        delta={nw ? <ChangeNote change={nw.changes.find((c) => c.days === 30)} /> : undefined}
        pendingNote={
          networth.isError ? t("overview.tiles.unavailable") : t("overview.tiles.loading")
        }
      />
      <StatTile
        label={t("overview.tiles.expenses")}
        icon={ArrowUpRight}
        value={ex ? <Money value={ex.total_eur} /> : undefined}
        delta={
          ex?.delta_pct != null
            ? t("overview.tiles.expensesDelta", {
                pct: formatPercent(ex.delta_pct / 100, { signed: true }),
              })
            : ex
              ? t("overview.tiles.expensesNoComparison")
              : undefined
        }
        pendingNote={
          expenses.isError ? t("overview.tiles.unavailable") : t("overview.tiles.loading")
        }
      />
      <StatTile
        label={t("overview.tiles.income")}
        icon={ArrowDownLeft}
        value={inc ? <Money value={inc.total_eur} /> : undefined}
        delta={
          inc?.savings_rate_pct != null
            ? t("overview.tiles.savings", { pct: formatPercent(inc.savings_rate_pct / 100) })
            : inc
              ? t("overview.tiles.savingsNone")
              : undefined
        }
        pendingNote={income.isError ? t("overview.tiles.unavailable") : t("overview.tiles.loading")}
      />
      <StatTile
        label={t("overview.tiles.returns")}
        icon={TrendingUp}
        value={
          ret?.simple_pct != null
            ? formatPercent(ret.simple_pct / 100, { signed: true })
            : undefined
        }
        delta={ret?.simple_pct != null ? t("overview.tiles.returnsNote") : undefined}
        pendingNote={
          portfolios.data && !portfolio
            ? t("overview.tiles.noPortfolio")
            : t("overview.tiles.loading")
        }
      />
    </section>
  );
}

/** Andamento del patrimonio negli ultimi tre mesi, con il collegamento alla pagina. */
export function NetWorthTrendCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const networth = useRecentNetWorth();
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("overview.netWorthCard.title")}</CardTitle>
        <CardDescription>{t("overview.netWorthCard.description")}</CardDescription>
        <CardAction>
          <Link to="/patrimonio" className="text-xs font-medium text-primary hover:underline">
            {t("overview.netWorthCard.details")}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {networth.data ? (
          <NetWorthChart points={networth.data.series} compact />
        ) : (
          <Skeleton className="h-52 w-full" />
        )}
      </CardContent>
    </Card>
  );
}
