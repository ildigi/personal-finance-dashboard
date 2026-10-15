import { Coins, Info, Landmark, PiggyBank, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
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

function ReturnTile({ summary, scope }: { summary: InvestmentSummary; scope: InvestmentScope }) {
  if (scope === "active") {
    const pct = summary.active.pct;
    return (
      <StatTile
        label="Rendimento"
        icon={TrendingUp}
        value={pct !== null ? formatPercent(pct / 100, { signed: true }) : undefined}
        delta="sul costo delle posizioni in mano, come la Pie nell'app"
        pendingNote="Nessuna posizione aperta"
      />
    );
  }
  const r = summary.returns;
  return (
    <StatTile
      label="Rendimento"
      icon={TrendingUp}
      value={
        r.simple_pct !== null ? formatPercent(r.simple_pct / 100, { signed: true }) : undefined
      }
      delta={
        r.mwr_annual_pct !== null
          ? `sul capitale versato · annuo ${formatPercent(r.mwr_annual_pct / 100, { signed: true })} tenendo conto di quando hai versato`
          : "sul capitale versato, non annualizzato"
      }
      pendingNote="Serve almeno un versamento"
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
      base della Pie <Money value={pie.invested_eur} />
      {sign(realized) !== 0 && (
        <>
          {" "}
          · <Money value={realized} signed /> nei ribilanciamenti
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
        <EmptyState icon={TrendingUp} title="Investimenti non disponibili">
          Il backend non risponde. Avvialo e riprova.
        </EmptyState>
      </Card>
    );
  }
  if (portfolios.data?.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={TrendingUp}
          title="Nessun conto di investimento collegato"
          action={
            <Button asChild>
              <Link to="/impostazioni">Collega Trading 212</Link>
            </Button>
          }
        >
          Il collegamento è in sola lettura: la dashboard legge portafoglio, ordini, dividendi e
          versamenti, senza poter comprare o vendere.
        </EmptyState>
      </Card>
    );
  }

  const data = summary.data;
  const start = portfolio?.tracking_start ?? null;
  const allLabel = start ? `Tutto (dal ${formatDate(start, "short")})` : "Tutto";
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
              <SelectTrigger aria-label="Portafoglio" className="w-56 bg-card">
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
              aggiornato {formatRelative(new Date(data.as_of))}
              {isLive && <span className="sr-only">, in tempo reale</span>}
            </span>
          )}
          {liveMessage && (
            <span className="text-xs" title={liveMessage}>
              · tempo reale in pausa
            </span>
          )}
          <span className="hidden sm:inline">· sola lettura</span>
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
              {sync.isPending ? "Aggiornamento…" : "Aggiorna"}
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
            label="Valore posizioni"
            icon={Landmark}
            value={data ? <Money value={data.active.value_eur} /> : undefined}
            delta="solo i titoli in mano, liquidità esclusa"
            pendingNote="Caricamento…"
          />
          <StatTile
            label="Costo posizioni"
            icon={PiggyBank}
            value={data ? <Money value={data.active.cost_eur} /> : undefined}
            delta="quanto hai pagato i titoli in mano"
            pendingNote="Caricamento…"
          />
          <StatTile
            label="Guadagno"
            icon={Wallet}
            value={data ? <Money value={data.active.pl_eur} signed tone="auto" /> : undefined}
            delta="valore meno costo delle posizioni in mano"
            pendingNote="Caricamento…"
          />
          {data ? (
            <ReturnTile summary={data} scope={scope} />
          ) : (
            <StatTile label="Rendimento" icon={TrendingUp} pendingNote="Caricamento…" />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatTile
            label="Valore attuale"
            icon={Landmark}
            value={data ? <Money value={data.value_eur} /> : undefined}
            delta={
              data ? (
                <>
                  di cui liquidità <Money value={data.cash_eur} />
                </>
              ) : undefined
            }
            pendingNote="Caricamento…"
          />
          <StatTile
            label="Capitale versato"
            icon={PiggyBank}
            value={data ? <Money value={data.net_deposited_eur} /> : undefined}
            delta={
              <>
                {data && start && Number(data.opening_balance_eur) > 0 ? (
                  <>
                    <Money value={data.opening_balance_eur} /> già sul conto il{" "}
                    {formatDate(start, "short")}
                    {Number(data.deposits_eur) > 0 && (
                      <>
                        {" "}
                        + versati <Money value={data.deposits_eur} />
                      </>
                    )}
                    {Number(data.withdrawals_eur) > 0 && (
                      <>
                        {" "}
                        − prelevati <Money value={data.withdrawals_eur} />
                      </>
                    )}
                  </>
                ) : data && Number(data.withdrawals_eur) > 0 ? (
                  <>
                    versati <Money value={data.deposits_eur} /> − prelevati{" "}
                    <Money value={data.withdrawals_eur} />
                  </>
                ) : (
                  "versamenti meno prelievi"
                )}
                {data && <PieBaseNote summary={data} />}
              </>
            }
            pendingNote="Caricamento…"
          />
          <StatTile
            label="Guadagno totale"
            icon={Wallet}
            value={
              data ? <Money value={data.returns.total_pl_eur} signed tone="auto" /> : undefined
            }
            delta="valore attuale meno capitale versato"
            pendingNote="Caricamento…"
          />
          {data ? (
            <ReturnTile summary={data} scope={scope} />
          ) : (
            <StatTile label="Rendimento" icon={TrendingUp} pendingNote="Caricamento…" />
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Posizioni</CardTitle>
          <CardDescription>
            {data ? (
              <>
                Valore <Money value={data.positions_value_eur} /> · costo{" "}
                <Money value={data.positions_cost_eur} />
              </>
            ) : (
              "Titoli ed ETF in portafoglio"
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
            <CardTitle>Da dove viene il guadagno</CardTitle>
            <CardDescription>
              {scope === "active"
                ? "Solo le posizioni in mano: vendite, dividendi e commissioni esclusi"
                : "I versamenti non contano mai come guadagno"}
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
            <CardTitle>Capitale versato e valore</CardTitle>
            <CardDescription>
              {start
                ? `Dal ${formatDate(start)}: quello che c'era sul conto quel giorno conta come capitale versato. `
                : ""}
              Il valore si registra mentre la dashboard è accesa (un punto ogni 15 minuti): lo
              storico cresce da quando il conto è collegato.
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
              Dividendi
            </CardTitle>
            <CardDescription>
              {data ? (
                <>
                  Ultimi 12 mesi <Money value={data.dividends_12m_eur} />
                  {data.dividend_yield_on_cost_pct !== null &&
                    ` · ${formatPercent(data.dividend_yield_on_cost_pct / 100)} sul costo`}
                </>
              ) : (
                "Per mese"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!activity.data ? (
              <Skeleton className="h-48 w-full" />
            ) : hasDividends ? (
              <DividendsChart months={months} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Nessun dividendo</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attività</CardTitle>
          <CardDescription>Ordini eseguiti, dividendi, versamenti e prelievi</CardDescription>
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

function ReturnsNote() {
  return (
    <details className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium select-none hover:text-foreground">
        <Info aria-hidden className="size-3.5" /> Come leggere i rendimenti
      </summary>
      <div className="mt-2 space-y-1.5">
        <p>
          <strong className="font-medium text-foreground">Guadagno totale</strong>: valore attuale
          meno capitale versato. Versare soldi non lo fa mai salire.
        </p>
        <p>
          <strong className="font-medium text-foreground">Rendimento</strong>: guadagno diviso per
          il capitale versato. Non è annualizzato: è quanto hai guadagnato su quello che hai messo.
        </p>
        <p>
          <strong className="font-medium text-foreground">Tutto o solo attivi</strong>: «Tutto»
          conta tutto ciò che hai investito dalla data di inizio, anche quello già venduto, più
          dividendi, interessi e commissioni. «Solo attivi» guarda solo i titoli che hai in mano
          (valore meno costo), come il risultato della Pie nell'app.
        </p>
        <p>
          <strong className="font-medium text-foreground">Data di inizio</strong>: quello che è
          successo prima non conta; il saldo del conto a quella data vale come capitale di partenza.
        </p>
        <p>
          <strong className="font-medium text-foreground">Annuo</strong>: compare solo quando ha
          senso, cioè con almeno un anno di storia e il capitale rimasto investito per buona parte
          del tempo. Annualizzare poco capitale investito per poche settimane produce cifre
          gonfiate, come i rendimenti altissimi che a volte mostra l'app dopo un versamento.
        </p>
      </div>
    </details>
  );
}
