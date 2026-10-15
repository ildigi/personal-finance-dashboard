import {
  CircleAlert,
  CircleCheck,
  ListFilter,
  MoreHorizontal,
  OctagonAlert,
  Pencil,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router";

import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { transactionsUrl } from "@/features/transactions/filters";
import { formatMoney, formatMonth, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import { budgetStatusText, type BudgetLevel } from "../month";
import type { BudgetMonth, BudgetOverview, BudgetStatus } from "../queries";

/** Colore del livello: riempimento pieno, traccia dello stesso colore più chiara. */
const LEVEL_STYLE: Record<BudgetLevel, { fill: string; track: string; icon: typeof CircleCheck }> =
  {
    ok: { fill: "bg-primary", track: "bg-primary/15", icon: CircleCheck },
    warning: { fill: "bg-status-warning", track: "bg-status-warning/20", icon: CircleAlert },
    over: { fill: "bg-status-critical", track: "bg-status-critical/15", icon: OctagonAlert },
  };

export function BudgetCard({
  budget,
  overview,
  onEdit,
  onDelete,
}: {
  budget: BudgetStatus;
  overview: BudgetOverview;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const level: BudgetLevel = budget.level;
  const style = LEVEL_STYLE[level];
  const StatusIcon = budget.projected_over && level === "ok" ? TrendingUp : style.icon;
  const used = Math.min(budget.used_pct, 100);
  const projected = Math.min(budget.projected_pct, 100);
  const remaining = Number(budget.remaining_eur);
  const showProjection = overview.is_current && budget.projected_eur !== budget.spent_eur;

  return (
    <Card className="gap-4 px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <CategoryIcon name={budget.icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{budget.name}</h3>
          <p className="text-sm text-muted-foreground">
            <Money value={budget.spent_eur} className="font-medium text-foreground" /> di{" "}
            <Money value={budget.amount} />
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tracking-tight">
            {formatPercent(budget.used_pct / 100, { digits: 0 })}
          </div>
        </div>
        {(onEdit ?? onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-2"
                aria-label={`Azioni per ${budget.name}`}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {onEdit && (
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil aria-hidden /> Modifica
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link
                  to={transactionsUrl({
                    category: budget.category_id,
                    ...(budget.subcategory_id ? { subcategory: budget.subcategory_id } : {}),
                  })}
                >
                  <ListFilter aria-hidden /> Vedi i movimenti
                </Link>
              </DropdownMenuItem>
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 aria-hidden /> Rimuovi il budget
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div>
        <div
          role="meter"
          aria-label={`Speso del budget ${budget.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(budget.used_pct)}
          aria-valuetext={`${formatMoney(budget.spent_eur)} su ${formatMoney(budget.amount)}`}
          className={cn("relative h-2.5 overflow-hidden rounded-full", style.track)}
        >
          {showProjection && projected > used && (
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full opacity-35",
                budget.projected_over ? "bg-status-serious" : style.fill,
              )}
              style={{ width: `${String(projected)}%` }}
            />
          )}
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full", style.fill)}
            style={{ width: `${String(used)}%` }}
          />
        </div>
        {/* Soglia di avviso: una tacca sotto la barra. */}
        <div className="relative h-2">
          <span
            aria-hidden
            className="absolute top-0 h-1.5 w-px bg-foreground/40"
            style={{ left: `${String(budget.alert_threshold_pct)}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <StatusIcon
              aria-hidden
              className={cn(
                "size-3.5",
                level === "over"
                  ? "text-status-critical"
                  : level === "warning" || budget.projected_over
                    ? "text-status-serious"
                    : "text-primary",
              )}
            />
            {budgetStatusText({ ...budget, level })}
          </span>
          <span className="text-muted-foreground">
            {remaining >= 0 ? (
              <>
                Restano <Money value={budget.remaining_eur} />
              </>
            ) : (
              <>
                Oltre di <Money value={String(-remaining)} />
              </>
            )}
            {showProjection && (
              <>
                {" · "}stima a fine mese <Money value={budget.projected_eur} />
              </>
            )}
          </span>
        </div>
        {showProjection && Number(budget.recurring_expected_eur) > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Include <Money value={budget.recurring_expected_eur} /> di addebiti ricorrenti attesi
          </p>
        )}
      </div>

      <History months={budget.history} current={overview.month} />
    </Card>
  );
}

/** Ultimi 6 mesi: colonne della spesa, trattino del budget di quel mese. */
function History({ months, current }: { months: BudgetMonth[]; current: string }) {
  const max = Math.max(
    ...months.map((m) => Math.max(Number(m.spent_eur), Number(m.amount ?? 0))),
    1,
  );
  return (
    <div className="border-t pt-3">
      <div className="mb-1.5 text-[11px] text-muted-foreground">Ultimi 6 mesi</div>
      <ul
        className="grid h-16 grid-cols-6 items-end gap-0.5"
        aria-label="Storico degli ultimi 6 mesi"
      >
        {months.map((m) => {
          const spent = Number(m.spent_eur);
          const amount = m.amount === null ? null : Number(m.amount);
          const over = amount !== null && spent > amount;
          const label = `${formatMonth(m.month, "long")}: ${formatMoney(spent)}${
            amount !== null ? ` su ${formatMoney(amount)}` : ", senza budget"
          }`;
          return (
            <li key={m.month} className="relative h-full">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    className="group relative flex h-full w-full items-end justify-center rounded-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span
                      data-sensitive
                      className={cn(
                        "w-3/5 max-w-6 rounded-t-[4px]",
                        over
                          ? "bg-status-critical/80"
                          : m.month === current
                            ? "bg-primary/70"
                            : "bg-muted-foreground/30",
                      )}
                      style={{
                        height: `${String(Math.max((spent / max) * 100, spent > 0 ? 3 : 0))}%`,
                      }}
                    />
                    {amount !== null && (
                      <span
                        aria-hidden
                        className="absolute inset-x-1 border-t-2 border-dashed border-foreground/50"
                        style={{ bottom: `${String((amount / max) * 100)}%` }}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <span data-sensitive>{label}</span>
                  {over && " (sforato)"}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 grid grid-cols-6 gap-0.5 text-center text-[10px] text-muted-foreground">
        {months.map((m) => (
          <span key={m.month} className={cn(m.month === current && "font-medium text-foreground")}>
            {formatMonth(m.month, "short")}
          </span>
        ))}
      </div>
    </div>
  );
}
