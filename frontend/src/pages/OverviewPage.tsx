import {
  Building2,
  Check,
  CreditCard,
  LineChart,
  PiggyBank,
  RefreshCw,
  ServerCrash,
  Wallet,
} from "lucide-react";

import type { Account, Health } from "@/api/client";
import { CURRENT_PHASE, ROADMAP } from "@/app/navigation";
import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { StatusIndicator, type Status } from "@/components/common/StatusIndicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BudgetOverviewCard,
  UpcomingChargesCard,
} from "@/features/budgets/components/PlanningCards";
import { AlertsCard } from "@/features/overview/AlertsCard";
import { NetWorthTrendCard, OverviewTiles } from "@/features/overview/OverviewTiles";
import { useAccounts, useHealth } from "@/features/system/queries";
import { formatDate, formatRelative, maskIban } from "@/lib/format";
import { todayInRome } from "@/lib/period";
import { cn } from "@/lib/utils";

function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("it-IT", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/Rome",
    }).format(now),
  );
  if (hour < 5) return "Buonanotte";
  if (hour < 13) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export function OverviewPage() {
  const health = useHealth();
  const unreachable = health.isError;

  return (
    <div className="space-y-6 lg:space-y-8">
      <section>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {formatDate(todayInRome(), "long")}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}</h2>
      </section>

      {unreachable && <BackendDownBanner onRetry={() => void health.refetch()} />}

      <OverviewTiles />

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <NetWorthTrendCard className="lg:col-span-2" />
        <AlertsCard />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
        <BudgetOverviewCard />
        <UpcomingChargesCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <AccountsCard className="lg:col-span-2" />
        <div className="space-y-4 lg:space-y-6">
          <SystemCard
            health={health.data}
            isPending={health.isPending}
            isError={unreachable}
            updatedAt={health.dataUpdatedAt}
            onRefresh={() => void health.refetch()}
            refreshing={health.isFetching}
          />
          <RoadmapCard />
        </div>
      </div>
    </div>
  );
}

function BackendDownBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-status-critical/30 bg-status-critical/5 p-4 sm:flex-row sm:items-center"
    >
      <ServerCrash aria-hidden className="size-5 shrink-0 text-status-critical" />
      <div className="flex-1 text-sm">
        <p className="font-medium">Il backend non risponde</p>
        <p className="text-muted-foreground">
          Avvialo dal task VS Code{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">dev:backend</code> oppure con{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">uv run uvicorn app.main:app</code>.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="self-start sm:self-auto">
        <RefreshCw aria-hidden /> Riprova
      </Button>
    </div>
  );
}

// --- Conti ------------------------------------------------------------------------------

const ACCOUNT_TYPE: Record<Account["type"], { label: string; icon: typeof Wallet }> = {
  checking: { label: "Conto corrente", icon: Building2 },
  savings: { label: "Conto risparmio", icon: PiggyBank },
  card: { label: "Carta", icon: CreditCard },
  credit_card: { label: "Carta di credito", icon: CreditCard },
  broker: { label: "Broker", icon: LineChart },
};

function AccountsCard({ className }: { className?: string }) {
  const { data: accounts, isPending, isError } = useAccounts();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Conti</CardTitle>
        <CardDescription>Conti e carte collegati alla dashboard</CardDescription>
        {accounts && accounts.length > 0 && (
          <CardAction>
            <Badge variant="secondary">{accounts.length}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {isPending ? (
          <div className="space-y-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Impossibile caricare i conti finché il backend non risponde.
          </p>
        ) : accounts.length === 0 ? (
          <EmptyState icon={Wallet} title="Nessun conto collegato">
            I conti di prova arrivano con la Fase 4; Crédit Agricole e Revolut con Open Banking
            (Fase 8), Trading 212 con la Fase 7.
          </EmptyState>
        ) : (
          <ul className="-mx-2 divide-y">
            {accounts.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AccountRow({ account }: { account: Account }) {
  const { label, icon: Icon } = ACCOUNT_TYPE[account.type];
  return (
    <li className="flex items-center gap-3 px-2 py-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        style={account.color ? { backgroundColor: account.color, color: "#fff" } : undefined}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{account.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {account.institution} · {label}
          {account.iban && (
            <span data-sensitive className="num">
              {" · "}
              {maskIban(account.iban)}
            </span>
          )}
        </p>
      </div>
      {account.balance !== null ? (
        <div className="text-right">
          <Money
            value={account.balance}
            currency={account.currency}
            className="num text-sm font-medium"
          />
          {account.balance_as_of && (
            <div className="text-xs text-muted-foreground">
              {account.balance_type === "booked" ? "contabile" : "disponibile"} al{" "}
              {formatDate(account.balance_as_of, "short")}
            </div>
          )}
        </div>
      ) : (
        <Badge variant="outline" className="num">
          {account.currency}
        </Badge>
      )}
    </li>
  );
}

// --- Stato del sistema ---------------------------------------------------------------------

interface SystemCardProps {
  health: Health | undefined;
  isPending: boolean;
  isError: boolean;
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}

function SystemCard({
  health,
  isPending,
  isError,
  updatedAt,
  refreshing,
  onRefresh,
}: SystemCardProps) {
  const rows: { label: string; status: Status; value: string }[] = isError
    ? [{ label: "Backend", status: "critical", value: "Non raggiungibile" }]
    : health
      ? [
          { label: "Backend", status: "good", value: "Operativo" },
          {
            label: "Database",
            status: health.database.ok ? "good" : "critical",
            value: health.database.ok ? "Connesso" : "Non raggiungibile",
          },
          {
            label: "Schema",
            status: health.database.up_to_date ? "good" : "warning",
            value: health.database.up_to_date ? "Aggiornato" : "Migrazioni da applicare",
          },
        ]
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stato del sistema</CardTitle>
        <CardDescription>
          {updatedAt > 0
            ? `Controllato ${formatRelative(new Date(updatedAt))}`
            : "Controllo in corso…"}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Ricontrolla">
            <RefreshCw aria-hidden className={cn(refreshing && "animate-spin")} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : (
          <dl className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd>
                  <StatusIndicator status={row.status} label={row.value} />
                </dd>
              </div>
            ))}
            {health && (
              <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                <span>Versione {health.version}</span>
                <span className="num">
                  {health.environment === "local" ? "Locale" : health.environment}
                  {health.database.migration_current &&
                    ` · ${health.database.migration_current.slice(0, 7)}`}
                </span>
              </div>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

// --- Avanzamento ------------------------------------------------------------------------------

function RoadmapCard() {
  const done = ROADMAP.filter((step) => step.phase < CURRENT_PHASE).length;
  const progress = Math.round((done / ROADMAP.length) * 100);
  const upcoming = ROADMAP.filter((step) => step.phase >= CURRENT_PHASE).slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avanzamento</CardTitle>
        <CardDescription>
          {done} fasi su {ROADMAP.length} completate
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avanzamento del progetto"
          className="h-2 overflow-hidden rounded-full bg-primary/15"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${String(progress)}%` }}
          />
        </div>
        <ol className="space-y-2.5">
          {upcoming.map((step) => {
            const current = step.phase === CURRENT_PHASE;
            return (
              <li key={step.phase} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    current
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {step.phase}
                </span>
                <span className={cn("flex-1", !current && "text-muted-foreground")}>
                  {step.title}
                </span>
                {current && <Badge variant="secondary">In corso</Badge>}
              </li>
            );
          })}
          <li className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex size-6 items-center justify-center rounded-full bg-status-good/15 text-status-good">
              <Check aria-hidden className="size-3.5" />
            </span>
            Fasi 0–{CURRENT_PHASE - 1} completate
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
