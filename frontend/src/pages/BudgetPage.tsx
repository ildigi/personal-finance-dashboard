import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Gauge,
  OctagonAlert,
  PiggyBank,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { StatTile } from "@/components/common/StatTile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetCard } from "@/features/budgets/components/BudgetCard";
import {
  BudgetEditorSheet,
  type BudgetDraft,
} from "@/features/budgets/components/BudgetEditorSheet";
import { currentMonth, shiftMonth } from "@/features/budgets/month";
import { useBudgets, useDeleteBudget, type BudgetStatus } from "@/features/budgets/queries";
import { useLookups } from "@/features/transactions/lookups";
import { formatCount, formatMonth, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BudgetPage() {
  const lookups = useLookups();
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const budgets = useBudgets(month === thisMonth ? null : month);
  const remove = useDeleteBudget();
  const [draft, setDraft] = useState<BudgetDraft | null>(null);

  if (budgets.isError) {
    return (
      <Card>
        <EmptyState icon={PiggyBank} title="Budget non disponibili">
          Il backend non risponde. Avvialo e riprova.
        </EmptyState>
      </Card>
    );
  }

  const data = budgets.data;
  const isCurrent = month === thisMonth;
  const alerts = data ? data.items.filter((i) => i.level !== "ok") : [];
  const atRisk = data ? data.items.filter((i) => i.level === "ok" && i.projected_over) : [];
  const total = Number(data?.total_amount ?? 0);

  function onDelete(budget: BudgetStatus): void {
    const ok = window.confirm(
      `Rimuovere il budget di ${budget.name}? Sparisce da questo mese in poi; i mesi passati restano nello storico.`,
    );
    if (ok) remove.mutate(budget.id);
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setMonth(shiftMonth(month, -1));
            }}
            aria-label="Mese precedente"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <h2 className="min-w-36 text-center text-base font-medium first-letter:uppercase">
            {formatMonth(month, "long")}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isCurrent}
            onClick={() => {
              setMonth(shiftMonth(month, 1));
            }}
            aria-label="Mese successivo"
          >
            <ChevronRight aria-hidden />
          </Button>
          {!isCurrent && (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setMonth(thisMonth);
              }}
            >
              Torna a questo mese
            </Button>
          )}
        </div>
        {isCurrent && (
          <Button
            onClick={() => {
              setDraft({ budget: null });
            }}
          >
            <Plus aria-hidden /> Nuovo budget
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label="Budget del mese"
          icon={PiggyBank}
          value={data && total > 0 ? <Money value={data.total_amount} /> : undefined}
          delta={data ? `${formatCount(data.items.length)} categorie con un limite` : undefined}
          pendingNote={data ? "Nessun budget in questo mese" : "Caricamento…"}
        />
        <StatTile
          label="Speso"
          icon={Wallet}
          value={data && total > 0 ? <Money value={data.total_spent_eur} /> : undefined}
          delta={
            data && total > 0
              ? `${formatPercent(Number(data.total_spent_eur) / total, { digits: 0 })} del budget`
              : undefined
          }
          pendingNote={data ? "—" : "Caricamento…"}
        />
        <StatTile
          label={isCurrent ? "Stima a fine mese" : "Totale del mese"}
          icon={TrendingUp}
          value={data && total > 0 ? <Money value={data.total_projected_eur} /> : undefined}
          delta={
            data && isCurrent
              ? `giorno ${String(data.days_elapsed)} di ${String(data.days_in_month)}`
              : "mese concluso"
          }
          pendingNote={data ? "—" : "Caricamento…"}
        />
        <StatTile
          label="Avvisi"
          icon={Gauge}
          value={data ? formatCount(alerts.length) : undefined}
          delta={
            data
              ? alerts.length === 0
                ? atRisk.length > 0
                  ? `${formatCount(atRisk.length)} a rischio a fine mese`
                  : "tutto sotto le soglie"
                : `${formatCount(data.over_count)} superati · ${formatCount(data.warning_count)} oltre la soglia`
              : undefined
          }
          pendingNote="Caricamento…"
        />
      </div>

      {alerts.length > 0 && (
        <ul
          aria-label="Avvisi dei budget"
          className="space-y-2 rounded-xl border border-status-serious/40 bg-status-serious/5 p-4"
        >
          {alerts.map((a) => {
            const Icon = a.level === "over" ? OctagonAlert : CircleAlert;
            return (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <Icon
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0",
                    a.level === "over" ? "text-status-critical" : "text-status-serious",
                  )}
                />
                <span>
                  <span className="font-medium">{a.name}</span>:{" "}
                  {a.level === "over"
                    ? "budget superato"
                    : `oltre il ${String(a.alert_threshold_pct)}%`}{" "}
                  (<Money value={a.spent_eur} /> di <Money value={a.amount} />)
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBank}
            title={isCurrent ? "Nessun budget" : "Nessun budget in questo mese"}
            action={
              isCurrent ? (
                <Button
                  onClick={() => {
                    setDraft({ budget: null });
                  }}
                >
                  <Plus aria-hidden /> Crea il primo budget
                </Button>
              ) : undefined
            }
          >
            {isCurrent
              ? "Imposta un limite mensile solo dove ti serve, per esempio Uscite o Vestiti. Le categorie senza budget restano fuori da questa pagina."
              : "I budget valgono dal mese in cui li crei."}
          </EmptyState>
        </Card>
      ) : (
        <div
          className={cn(
            "grid gap-4 lg:grid-cols-2 lg:gap-6",
            budgets.isPlaceholderData && "opacity-60 transition-opacity",
          )}
        >
          {data.items.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              overview={data}
              onEdit={
                isCurrent
                  ? () => {
                      setDraft({ budget: b });
                    }
                  : undefined
              }
              onDelete={
                isCurrent
                  ? () => {
                      onDelete(b);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <BudgetEditorSheet
        draft={draft}
        lookups={lookups}
        onClose={() => {
          setDraft(null);
        }}
      />
    </div>
  );
}
