import { Landmark, LineChart, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { StatTile } from "@/components/common/StatTile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeNote } from "@/features/networth/ChangeNote";
import { NetWorthChart } from "@/features/networth/NetWorthChart";
import {
  NETWORTH_RANGES,
  rangeStart,
  useNetWorth,
  type NetWorthAccount,
  type NetWorthOverview,
  type NetWorthRange,
} from "@/features/networth/queries";
import { formatDate, formatPercent } from "@/lib/format";
import { todayInRome } from "@/lib/period";
import { cn } from "@/lib/utils";

export function NetWorthPage() {
  const [range, setRange] = useState<NetWorthRange>("6m");
  const today = todayInRome();
  const query = useNetWorth(rangeStart(range, today));
  const data = query.data;

  if (query.isError) {
    return (
      <Card>
        <EmptyState icon={Landmark} title="Patrimonio non disponibile">
          Il backend non risponde. Avvialo e riprova.
        </EmptyState>
      </Card>
    );
  }
  if (data?.accounts.length === 0) {
    return (
      <Card>
        <EmptyState icon={Landmark} title="Nessun conto da sommare">
          Collega una banca o il broker da Impostazioni: il patrimonio si calcola dai loro saldi.
        </EmptyState>
      </Card>
    );
  }

  const change30 = data?.changes.find((c) => c.days === 30);
  const change365 = data?.changes.find((c) => c.days === 365);
  const up = change30?.delta_eur ? Number(change30.delta_eur) >= 0 : true;

  return (
    <div className="space-y-4 lg:space-y-6">
      <p className="text-sm text-muted-foreground">
        Conti e investimenti sommati, giorno per giorno. Saldo disponibile delle banche, valore del
        conto per il broker.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label="Patrimonio netto"
          icon={Landmark}
          value={data ? <Money value={data.total_eur} /> : undefined}
          delta={data ? <ChangeNote change={change30} /> : undefined}
          pendingNote="Caricamento…"
        />
        <StatTile
          label="Liquidità"
          icon={Wallet}
          value={data ? <Money value={data.cash_eur} /> : undefined}
          delta={data ? share(data, "cash") : undefined}
          pendingNote="Caricamento…"
        />
        <StatTile
          label="Investimenti"
          icon={LineChart}
          value={data ? <Money value={data.investments_eur} /> : undefined}
          delta={data ? share(data, "investments") : undefined}
          pendingNote="Caricamento…"
        />
        <StatTile
          label="Ultimo anno"
          icon={up ? TrendingUp : TrendingDown}
          value={
            change365?.delta_eur != null ? <Money value={change365.delta_eur} signed /> : undefined
          }
          delta={
            change365?.delta_pct != null
              ? `${formatPercent(change365.delta_pct / 100, { signed: true })} in 365 giorni`
              : undefined
          }
          pendingNote={data ? "Servono 12 mesi di dati completi per tutti i conti" : "Caricamento…"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Andamento</CardTitle>
          <CardDescription>
            {data?.complete_from
              ? `Dati completi per tutti i conti dal ${formatDate(data.complete_from, "long")}`
              : "Lo storico si completa man mano che le sincronizzazioni salvano i saldi"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RangeToggle value={range} onChange={setRange} />
          {data ? (
            <div className={cn(query.isPlaceholderData && "opacity-60 transition-opacity")}>
              <NetWorthChart points={data.series} />
            </div>
          ) : (
            <Skeleton className="h-80 w-full" />
          )}
          {data && <CoverageNotes accounts={data.accounts} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per conto</CardTitle>
          <CardDescription>Quanto pesa ogni conto sul patrimonio di oggi</CardDescription>
        </CardHeader>
        <CardContent>
          {data ? (
            <ul className="divide-y">
              {data.accounts.map((a) => (
                <AccountShare key={a.account_id} account={a} />
              ))}
            </ul>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function share(data: NetWorthOverview, kind: NetWorthAccount["kind"]): string | undefined {
  const total = Number(data.total_eur);
  const part = Number(kind === "cash" ? data.cash_eur : data.investments_eur);
  if (total <= 0) return undefined;
  return `${formatPercent(part / total)} del patrimonio`;
}

function RangeToggle({
  value,
  onChange,
}: {
  value: NetWorthRange;
  onChange: (value: NetWorthRange) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Periodo mostrato"
      className="inline-flex rounded-lg border p-0.5"
    >
      {NETWORTH_RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          role="radio"
          aria-checked={value === r.key}
          onClick={() => {
            onChange(r.key);
          }}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === r.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** Da quando ogni conto ha dati veri: spiega le zone ombreggiate del grafico. */
function CoverageNotes({ accounts }: { accounts: NetWorthAccount[] }) {
  const notes = accounts
    .filter((a) => a.history_from)
    .map((a) =>
      a.kind === "investments"
        ? `${a.institution}: valore reale dal ${formatDate(a.history_from ?? "", "long")}; prima è stimato con il capitale versato.`
        : `${a.institution}: storico dal ${formatDate(a.history_from ?? "", "long")}; prima mancano i dati della banca.`,
    );
  if (notes.length === 0) return null;
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
      <p className="mb-1 font-medium text-foreground">Le zone grigie del grafico</p>
      <ul className="list-disc space-y-0.5 pl-4">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

function AccountShare({ account }: { account: NetWorthAccount }) {
  const pct = account.share_pct ?? 0;
  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">{account.name}</span>
        {account.value_eur !== null ? (
          <Money value={account.value_eur} className="num shrink-0 text-sm font-medium" />
        ) : (
          <span className="shrink-0 text-sm text-muted-foreground">—</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{
              width: `${String(pct)}%`,
              background: account.kind === "investments" ? "var(--chart-3)" : "var(--chart-1)",
            }}
          />
        </div>
        <span className="num w-12 shrink-0 text-right text-xs text-muted-foreground">
          {account.share_pct !== null ? formatPercent(pct / 100) : "—"}
        </span>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {account.institution} · {account.kind === "investments" ? "investimenti" : "liquidità"}
        {account.as_of && ` · saldo al ${formatDate(account.as_of, "short")}`}
      </p>
    </li>
  );
}
