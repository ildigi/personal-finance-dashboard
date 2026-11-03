import { ArrowDownLeft, ArrowUpRight, ListFilter, Plus, Receipt, Wallet } from "lucide-react";
import { useCallback, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkActionsBar } from "@/features/transactions/components/BulkActionsBar";
import { LinkedFilterChips } from "@/features/transactions/components/LinkedFilterChips";
import { NewTransactionSheet } from "@/features/transactions/components/NewTransactionSheet";
import { TransactionDetailSheet } from "@/features/transactions/components/TransactionDetailSheet";
import { TransactionFiltersBar } from "@/features/transactions/components/TransactionFiltersBar";
import { TransactionList } from "@/features/transactions/components/TransactionList";
import { TransactionTable } from "@/features/transactions/components/TransactionTable";
import { useTransactionFilters } from "@/features/transactions/filters";
import { useLookups } from "@/features/transactions/lookups";
import { useTransactions } from "@/features/transactions/queries";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { formatCount } from "@/lib/format";
import { formatRange, periodLabel, resolvePeriod } from "@/lib/period";
import { usePeriod } from "@/lib/preferences";
import { cn } from "@/lib/utils";

function Totals({
  count,
  inflow,
  outflow,
  loading,
}: {
  count: number;
  inflow: string;
  outflow: string;
  loading: boolean;
}) {
  const items = [
    { label: "Movimenti", icon: Receipt, value: <span>{formatCount(count)}</span> },
    {
      label: "Entrate",
      icon: ArrowDownLeft,
      value: <Money value={inflow} signed tone="auto" />,
    },
    { label: "Uscite", icon: ArrowUpRight, value: <Money value={outflow} signed /> },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {items.map(({ label, icon: Icon, value }) => (
        <Card key={label} className="gap-1 px-3 py-3 sm:px-5 sm:py-4">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
            <Icon aria-hidden className="hidden size-4 sm:block" />
            {label}
          </span>
          {loading ? (
            <Skeleton className="h-6 w-20 sm:h-7 sm:w-28" />
          ) : (
            <span className="truncate text-base font-semibold tracking-tight sm:text-2xl">
              {value}
            </span>
          )}
        </Card>
      ))}
    </div>
  );
}

export function TransactionsPage() {
  const [period] = usePeriod();
  const range = resolvePeriod(period);
  const { filters, setFilter, reset, activeCount } = useTransactionFilters();
  const lookups = useLookups();
  const query = useTransactions(filters, range);
  const isDesktop = useIsDesktop();
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback((ids: number[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const pages = query.data?.pages ?? [];
  const rows = pages.flatMap((p) => p.items);
  const first = pages[0];
  const noAccounts = lookups.accounts.length === 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {periodLabel(period)} · {formatRange(range)}
        </p>
        <Button
          onClick={() => {
            setCreating(true);
          }}
          disabled={noAccounts}
          className="self-start sm:self-auto"
        >
          <Plus aria-hidden />
          Nuovo movimento
        </Button>
      </div>

      <Totals
        count={first?.totals.count ?? 0}
        inflow={first?.totals.inflow_eur ?? "0"}
        outflow={first?.totals.outflow_eur ?? "0"}
        loading={query.isPending}
      />

      <TransactionFiltersBar
        filters={filters}
        setFilter={setFilter}
        reset={reset}
        activeCount={activeCount}
        lookups={lookups}
      />
      <LinkedFilterChips filters={filters} setFilter={setFilter} lookups={lookups} />

      <Card className="relative min-h-80 gap-0 overflow-hidden py-0" aria-busy={query.isFetching}>
        {/* Caricamento discreto: una linea in alto, senza far lampeggiare l'elenco. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary/70 transition-opacity duration-300",
            query.isFetching && !query.isPending ? "animate-pulse opacity-100" : "opacity-0",
          )}
        />
        {query.isPending ? (
          <div className="space-y-4 p-5">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState icon={Wallet} title="Movimenti non disponibili">
            Il backend non risponde. Avvialo e riprova.
          </EmptyState>
        ) : rows.length === 0 ? (
          activeCount > 0 ? (
            <EmptyState
              icon={ListFilter}
              title="Nessun movimento con questi filtri"
              action={
                <Button variant="outline" onClick={reset}>
                  Azzera i filtri
                </Button>
              }
            >
              Prova a togliere qualche filtro o a scegliere un periodo più ampio.
            </EmptyState>
          ) : (
            <EmptyState icon={Receipt} title="Nessun movimento nel periodo">
              {noAccounts
                ? "Carica i dati di prova dalle Impostazioni, oppure collega i conti nelle prossime fasi."
                : "Scegli un periodo più ampio dal selettore in alto."}
            </EmptyState>
          )
        ) : isDesktop ? (
          <TransactionTable
            rows={rows}
            lookups={lookups}
            sort={filters.sort}
            onSort={(sort) => {
              setFilter("sort", sort);
            }}
            onOpen={setOpenId}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />
        ) : (
          <TransactionList rows={rows} lookups={lookups} onOpen={setOpenId} />
        )}

        {rows.length > 0 && first && (
          <div className="flex flex-col items-center gap-2 border-t px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:justify-between">
            <span>
              {formatCount(rows.length)} di {formatCount(first.total)} movimenti
            </span>
            {query.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? "Caricamento…" : "Carica altri"}
              </Button>
            )}
          </div>
        )}
      </Card>

      {isDesktop && selected.size > 0 && (
        <BulkActionsBar
          selected={selected}
          lookups={lookups}
          onClear={() => {
            setSelected(new Set());
          }}
        />
      )}
      {/* Spazio per la barra delle azioni: l'ultima riga resta raggiungibile. */}
      {isDesktop && selected.size > 0 && <div aria-hidden className="h-20" />}

      <TransactionDetailSheet
        id={openId}
        lookups={lookups}
        onClose={() => {
          setOpenId(null);
        }}
        onOpen={setOpenId}
      />
      <NewTransactionSheet
        open={creating}
        onOpenChange={setCreating}
        lookups={lookups}
        onCreated={setOpenId}
      />
    </div>
  );
}
