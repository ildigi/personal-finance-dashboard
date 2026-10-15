import { Database, RefreshCw } from "lucide-react";
import { useState } from "react";

import { StatusIndicator, type Status } from "@/components/common/StatusIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectBank } from "@/features/banks/ConnectBank";
import { ConsentStatus } from "@/features/banks/ConsentStatus";
import { DisconnectBank } from "@/features/banks/DisconnectBank";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  describeSummary,
  useConnectTrading212,
  useSetupMockData,
  useSources,
  useSyncSource,
  useTrading212Status,
  type Source,
  type SyncSummary,
} from "./queries";

const STATUS: Record<Source["status"], { status: Status; label: string }> = {
  active: { status: "good", label: "Attiva" },
  expired: { status: "warning", label: "Consenso scaduto" },
  error: { status: "critical", label: "Errore" },
  disabled: { status: "unknown", label: "Disattivata" },
};

const PROVIDER: Record<Source["provider"], string> = {
  mock: "Dati di prova",
  manual: "Inserimento manuale",
  enablebanking: "Open Banking",
  trading212: "API ufficiale",
};

function SourceRow({ source }: { source: Source }) {
  const sync = useSyncSource();
  const [result, setResult] = useState<SyncSummary | null>(null);
  const canSync = source.provider !== "manual" && source.status !== "disabled";
  const { status, label } = STATUS[source.status];

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Database aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{source.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {PROVIDER[source.provider]} ·{" "}
            {source.last_sync_at
              ? `aggiornata ${formatRelative(new Date(source.last_sync_at))}`
              : "mai sincronizzata"}
          </p>
        </div>
        {canSync && (
          <Button
            variant="outline"
            size="sm"
            disabled={sync.isPending}
            onClick={() => {
              setResult(null);
              sync.mutate(source.id, { onSuccess: setResult });
            }}
            aria-label={`Sincronizza ${source.display_name}`}
          >
            <RefreshCw aria-hidden className={cn(sync.isPending && "animate-spin")} />
            <span className="hidden sm:inline">Sincronizza</span>
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-xs text-muted-foreground">
        <StatusIndicator status={status} label={label} className="text-xs" />
        <ConsentStatus source={source} />
        <DisconnectBank source={source} />
        {result && (
          <span role="status" className={cn(result.status === "error" && "text-destructive")}>
            {describeSummary(result)}
          </span>
        )}
        {sync.isError && <span className="text-destructive">{sync.error.message}</span>}
      </div>
    </li>
  );
}

/** Collegamento del conto Trading 212: la chiave sta nel file dei segreti, mai nel browser. */
function ConnectTrading212() {
  const status = useTrading212Status();
  const connect = useConnectTrading212();
  if (!status.data) return null;
  return (
    <div className="rounded-xl border border-dashed p-4 text-sm">
      <p className="font-medium">Trading 212</p>
      {status.data.credentials_found ? (
        <>
          <p className="mt-1 text-muted-foreground">
            Chiave API trovata nel file dei segreti. Il collegamento è in sola lettura: la dashboard
            legge portafoglio, ordini, dividendi e versamenti, senza poter operare.
          </p>
          <Button
            className="mt-3"
            size="sm"
            disabled={connect.isPending}
            onClick={() => {
              connect.mutate();
            }}
          >
            {connect.isPending ? "Collegamento…" : "Collega Trading 212"}
          </Button>
          {connect.data && (
            <p role="status" className="mt-2 text-muted-foreground">
              {describeSummary(connect.data)}
            </p>
          )}
          {connect.isError && <p className="mt-2 text-destructive">{connect.error.message}</p>}
        </>
      ) : (
        <p className="mt-1 text-muted-foreground">
          Crea una chiave API di sola lettura nell'app Trading 212 e salvala nel file{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">secrets\trading212.env</code>{" "}
          dentro la cartella dei dati (vedi la guida nella specifica, §9).
        </p>
      )}
    </div>
  );
}

/** Connessioni: sorgenti presenti nel database e come collegarne di nuove. */
export function ConnectionsCard() {
  const { data: sources, isPending, isError } = useSources();
  const setup = useSetupMockData();
  const hasMock = sources?.some((s) => s.provider === "mock") ?? false;
  const hasTrading212 = sources?.some((s) => s.provider === "trading212") ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connessioni</CardTitle>
        <CardDescription>Banche e broker, sempre in sola lettura</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Il backend non risponde.</p>
        ) : sources.length > 0 ? (
          <ul className="divide-y">
            {sources.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </ul>
        ) : null}

        {!isPending && !isError && <ConnectBank />}

        {!isPending && !isError && !hasTrading212 && <ConnectTrading212 />}

        {!isPending && !isError && !hasMock && (
          <div className="rounded-xl border border-dashed p-4 text-sm">
            <p className="font-medium">Dati di prova</p>
            <p className="mt-1 text-muted-foreground">
              15 mesi di movimenti verosimili su conti finti, per provare la dashboard prima di
              collegare i conti veri. Si possono rimuovere in qualsiasi momento.
            </p>
            <Button
              className="mt-3"
              size="sm"
              disabled={setup.isPending}
              onClick={() => {
                setup.mutate();
              }}
            >
              {setup.isPending ? "Caricamento…" : "Carica i dati di prova"}
            </Button>
            {setup.isError && <p className="mt-2 text-destructive">{setup.error.message}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
