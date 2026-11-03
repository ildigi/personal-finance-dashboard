import { Coins, Info, Landmark, PiggyBank, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { Trans } from "react-i18next";
import { Link } from "react-router";

import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { StatTile } from "@/components/common/StatTile";
import { StatusDot } from "@/components/common/StatusIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonth } from "@/features/budgets/month";
import { ActivityTabs } from "@/features/investments/components/ActivityTabs";
import { CapitalChart, DividendsChart } from "@/features/investments/components/CapitalChart";
import { GainBreakdown } from "@/features/investments/components/GainBreakdown";
import { PieCard } from "@/features/investments/components/PieCard";
import { PositionsTable } from "@/features/investments/components/PositionsTable";
import { ScopeToggle } from "@/features/investments/components/ScopeToggle";
import {
  TrackingStartButton,
  TrackingStartPanel,
} from "@/features/investments/components/TrackingStart";
import { fillMonths } from "@/features/investments/months";
import {
  useInvestmentActivity,
  useInvestmentSummary,
  useLiveRefresh,
  usePortfolios,
  type InvestmentSummary,
} from "@/features/investments/queries";
import { describeSummary, useSyncSource } from "@/features/sync/queries";
import { formatDate, formatPercent, formatRelative, sign } from "@/lib/format";
import { useInvestmentScope, type InvestmentScope } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { i18n } from "@/i18n";

function ReturnTile({ summary, scope }: { summary: InvestmentSummary; scope: InvestmentScope }) {
  if (scope === "active") {
    const pct = summary.active.pct;
    return (
      <StatTile
        label={i18n.t("investments.tiles.return")}
        icon={TrendingUp}
        value={pct !== null ? formatPercent(pct / 100, { signed: true }) : undefined}
        delta={i18n.t("investments.tiles.returnActive")}
        pendingNote={i18n.t("investments.tiles.noPositions")}
      />
    );
  }
  const r = summary.returns;
  return (
    <StatTile
      label={i18n.t("investments.tiles.return")}
      icon={TrendingUp}
      value={
        r.simple_pct !== null ? formatPercent(r.simple_pct / 100, { signed: true }) : undefined
      }
      delta={
        r.mwr_annual_pct !== null
          ? i18n.t("investments.tiles.returnAnnual", {
              pct: formatPercent(r.mwr_annual_pct / 100, { signed: true }),
            })
          : i18n.t("investments.tiles.returnSimple")
      }
      pendingNote={i18n.t("investments.tiles.needDeposit")}
    />
  );
}

/**
 * Collega il capitale versato alla base della Pie mostrata dall'app: quando Trading 212
 * vende per ribilanciare toglie dalla base il costo di ciò che ha venduto, quindi le perdite
 * (o i guadagni) realizzati nei ribilanciamenti spiegano la differenza.
 * Solo se tutte le posizioni stanno in un'unica Pie, altrimenti il confronto non regge.
 */
function PieBaseNote({ summary }: { summary: InvestmentSummary }) {
  const [pie] = summary.pies;
  if (summary.pies.length !== 1 || !pie) return null;
  if (!summary.positions.every((p) => p.pie_name === pie.name)) return null;
  const realized = summary.breakdown.realized_eur;
  return (
    <span className="mt-0.5 block">
      {i18n.t("investments.tiles.pieBase")} <Money value={pie.invested_eur} />
      {sign(realized) !== 0 && (
        <>
          {" "}
          · <Money value={realized} signed /> {i18n.t("investments.tiles.inRebalances")}
        </>
      )}
    </span>
  );
}

export function InvestmentsPage() {
  const portfolios = usePortfolios();
  const [chosen, setChosen] = useState<number | null>(null);
  const portfolioId = chosen ?? portfolios.data?.[0]?.id ?? null;
  const summary = useInvestmentSummary(portfolioId);
  const activity = useInvestmentActivity(portfolioId);
  const sync = useSyncSource();
  const [scope, setScope] = useInvestmentScope();
  const [editingStart, setEditingStart] = useState(false);
  const portfolio = portfolios.data?.find((p) => p.id === portfolioId);
  const live = useLiveRefresh(portfolioId, Boolean(portfolio && !portfolio.is_mock));

  if (portfolios.isError || summary.isError) {
    return (
      <Card>
        <EmptyState icon={TrendingUp} title={i18n.t("investments.unavailable")}>
          {i18n.t("analytics.backendDown")}
        </EmptyState>
      </Card>
    );
  }
  if (portfolios.data?.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={TrendingUp}
          title={i18n.t("investments.noPortfolioTitle")}
          action={
            <Button asChild>
              <Link to="/impostazioni">{i18n.t("investments.connect")}</Link>
            </Button>
          }
        >
          {i18n.t("investments.noPortfolio")}
        </EmptyState>
      </Card>
    );
  }

  const data = summary.data;
  const start = portfolio?.tracking_start ?? null;
  const allLabel = start
    ? i18n.t("investments.allSince", { date: formatDate(start, "short") })
    : i18n.t("investments.all");
  const liveMessage = live.data?.message ?? null;
  const isLive = live.isSuccess && liveMessage === null;
  const months = activity.data ? fillMonths(activity.data.months, currentMonth()) : [];
  const hasDividends = months.some((m) => Number(m.dividends_eur) > 0);

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {portfolios.data && portfolios.data.length > 1 ? (
            <Select
              value={String(portfolioId)}
              onValueChange={(v) => {
                setChosen(Number(v));
              }}
            >
              <SelectTrigger aria-label={i18n.t("investments.portfolio")} className="w-56 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {portfolios.data.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-medium text-foreground">{portfolio?.name}</span>
          )}
          {portfolio && (
            <TrackingStartButton
              start={start}
              open={editingStart}
              onToggle={() => {
                setEditingStart((v) => !v);
              }}
            />
          )}
          {data?.as_of && (
            <span className="inline-flex items-center gap-1.5">
              {!portfolio?.is_mock && <StatusDot status={isLive ? "good" : "unknown"} />}
              {i18n.t("investments.updated", { when: formatRelative(new Date(data.as_of)) })}
              {isLive && <span className="sr-only">{i18n.t("investments.liveSr")}</span>}
            </span>
          )}
          {liveMessage && (
            <span className="text-xs" title={liveMessage}>
              {i18n.t("investments.livePaused")}
            </span>
          )}
          <span className="hidden sm:inline">{i18n.t("investments.readOnly")}</span>
        </div>
        {portfolio && (
          <div className="flex flex-wrap items-center gap-3">
            <ScopeToggle value={scope} onChange={setScope} allLabel={allLabel} />
            {sync.data && (
              <span role="status" className="text-xs text-muted-foreground">
                {describeSummary(sync.data)}
              </span>
            )}
            {sync.isError && <span className="text-xs text-destructive">{sync.error.message}</span>}
            <Button
              variant="outline"
              size="sm"
              disabled={sync.isPending}
              onClick={() => {
                sync.mutate(portfolio.source_id);
              }}
            >
              <RefreshCw aria-hidden className={cn(sync.isPending && "animate-spin")} />
              {sync.isPending ? i18n.t("investments.refreshing") : i18n.t("investments.refresh")}
            </Button>
          </div>
        )}
      </div>

      {editingStart && portfolio && (
        <TrackingStartPanel
          portfolioId={portfolio.id}
          start={start}
          onClose={() => {
            setEditingStart(false);
          }}
        />
      )}

      {scope === "active" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatTile
            label={i18n.t("investments.tiles.positionsValue")}
            icon={Landmark}
            value={data ? <Money value={data.active.value_eur} /> : undefined}
            delta={i18n.t("investments.tiles.positionsValueNote")}
            pendingNote={i18n.t("analytics.loading")}
          />
          <StatTile
            label={i18n.t("investments.tiles.positionsCost")}
            icon={PiggyBank}
            value={data ? <Money value={data.active.cost_eur} /> : undefined}
            delta={i18n.t("investments.tiles.positionsCostNote")}
            pendingNote={i18n.t("analytics.loading")}
          />
          <StatTile
            label={i18n.t("investments.tiles.gain")}
            icon={Wallet}
            value={data ? <Money value={data.active.pl_eur} signed tone="auto" /> : undefined}
            delta={i18n.t("investments.tiles.gainNote")}
            pendingNote={i18n.t("analytics.loading")}
          />
          {data ? (
            <ReturnTile summary={data} scope={scope} />
          ) : (
            <StatTile
              label={i18n.t("investments.tiles.return")}
              icon={TrendingUp}
              pendingNote={i18n.t("analytics.loading")}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatTile
            label={i18n.t("investments.tiles.currentValue")}
            icon={Landmark}
            value={data ? <Money value={data.value_eur} /> : undefined}
            delta={
              data ? (
                <>
                  {i18n.t("investments.tiles.cashPart")} <Money value={data.cash_eur} />
                </>
              ) : undefined
            }
            pendingNote={i18n.t("analytics.loading")}
          />
          <StatTile
            label={i18n.t("investments.tiles.netDeposits")}
            icon={PiggyBank}
            value={data ? <Money value={data.net_deposited_eur} /> : undefined}
            delta={
              <>
                {data && start && Number(data.opening_balance_eur) > 0 ? (
                  <>
                    <Money value={data.opening_balance_eur} />{" "}
                    {i18n.t("investments.tiles.openingOn", { date: formatDate(start, "short") })}
                    {Number(data.deposits_eur) > 0 && (
                      <>
                        {" "}
                        + {i18n.t("investments.tiles.deposited")}{" "}
                        <Money value={data.deposits_eur} />
                      </>
                    )}
                    {Number(data.withdrawals_eur) > 0 && (
                      <>
                        {" "}
                        − {i18n.t("investments.tiles.withdrawn")}{" "}
                        <Money value={data.withdrawals_eur} />
                      </>
                    )}
                  </>
                ) : data && Number(data.withdrawals_eur) > 0 ? (
                  <>
                    {i18n.t("investments.tiles.deposited")} <Money value={data.deposits_eur} /> −{" "}
                    {i18n.t("investments.tiles.withdrawn")} <Money value={data.withdrawals_eur} />
                  </>
                ) : (
                  i18n.t("investments.tiles.depositsMinusWithdrawals")
                )}
                {data && <PieBaseNote summary={data} />}
              </>
            }
            pendingNote={i18n.t("analytics.loading")}
          />
          <StatTile
            label={i18n.t("investments.tiles.totalGain")}
            icon={Wallet}
            value={
              data ? <Money value={data.returns.total_pl_eur} signed tone="auto" /> : undefined
            }
            delta={i18n.t("investments.tiles.totalGainNote")}
            pendingNote={i18n.t("analytics.loading")}
          />
          {data ? (
            <ReturnTile summary={data} scope={scope} />
          ) : (
            <StatTile
              label={i18n.t("investments.tiles.return")}
              icon={TrendingUp}
              pendingNote={i18n.t("analytics.loading")}
            />
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{i18n.t("investments.positions.title")}</CardTitle>
          <CardDescription>
            {data ? (
              <>
                {i18n.t("investments.positions.value")} <Money value={data.positions_value_eur} /> ·{" "}
                {i18n.t("investments.positions.cost")} <Money value={data.positions_cost_eur} />
              </>
            ) : (
              i18n.t("investments.positions.fallback")
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data ? (
            <PositionsTable positions={data.positions} />
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{i18n.t("investments.gain.title")}</CardTitle>
            <CardDescription>
              {scope === "active"
                ? i18n.t("investments.gain.activeDescription")
                : i18n.t("investments.gain.allDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data ? (
              <GainBreakdown summary={data} scope={scope} />
            ) : (
              <Skeleton className="h-48 w-full" />
            )}
            <ReturnsNote />
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4 lg:col-span-2 lg:space-y-6">
          {data?.pies.map((pie) => (
            <PieCard key={pie.id} pie={pie} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{i18n.t("investments.capital.title")}</CardTitle>
            <CardDescription>
              {start ? i18n.t("investments.capital.since", { date: formatDate(start) }) : ""}
              {i18n.t("investments.capital.recording")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activity.data ? (
              <CapitalChart months={months} />
            ) : (
              <Skeleton className="h-64 w-full" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins aria-hidden className="size-4 text-muted-foreground" />
              {i18n.t("investments.dividends.title")}
            </CardTitle>
            <CardDescription>
              {data ? (
                <>
                  {i18n.t("investments.dividends.last12")} <Money value={data.dividends_12m_eur} />
                  {data.dividend_yield_on_cost_pct !== null &&
                    ` · ${i18n.t("investments.dividends.onCost", { pct: formatPercent(data.dividend_yield_on_cost_pct / 100) })}`}
                </>
              ) : (
                i18n.t("investments.dividends.perMonth")
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!activity.data ? (
              <Skeleton className="h-48 w-full" />
            ) : hasDividends ? (
              <DividendsChart months={months} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {i18n.t("investments.dividends.none")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{i18n.t("investments.activity.title")}</CardTitle>
          <CardDescription>{i18n.t("investments.activity.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.data ? (
            <ActivityTabs activity={activity.data} />
          ) : (
            <Skeleton className="h-48 w-full" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const STRONG = { strong: <strong className="font-medium text-foreground" /> };

function ReturnsNote() {
  return (
    <details className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium select-none hover:text-foreground">
        <Info aria-hidden className="size-3.5" /> {i18n.t("investments.returnsNote.title")}
      </summary>
      <div className="mt-2 space-y-1.5">
        {(["totalGain", "return", "scope", "start", "annual"] as const).map((key) => (
          <p key={key}>
            <Trans i18nKey={`investments.returnsNote.${key}`} components={STRONG} />
          </p>
        ))}
      </div>
    </details>
  );
}
