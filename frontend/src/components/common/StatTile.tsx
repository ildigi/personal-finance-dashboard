import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { i18n } from "@/i18n";

interface StatTileProps {
  label: string;
  /** Valore già formattato (es. <Money/>). Assente = dato non ancora disponibile. */
  value?: ReactNode;
  icon?: LucideIcon;
  /** Variazione rispetto a un periodo nominato, es. "+4,2% vs settembre". */
  delta?: ReactNode;
  /** Nota sotto il valore quando il dato non c'è ancora. */
  pendingNote?: string;
  className?: string;
}

/**
 * Tessera KPI: etichetta, valore, variazione facoltativa.
 * Valore in cifre proporzionali (non tabulari): è un numero isolato, non una colonna.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  pendingNote,
  className,
}: StatTileProps) {
  const pending = value === undefined;
  return (
    <Card className={cn("gap-3 px-4 py-4 sm:px-5 sm:py-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] leading-snug font-medium text-muted-foreground sm:text-sm">
          {label}
        </span>
        {Icon && (
          <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:flex">
            <Icon aria-hidden className="size-4" />
          </span>
        )}
      </div>
      {pending ? (
        <div>
          <div
            aria-hidden
            className="text-2xl font-semibold tracking-tight text-muted-foreground/40 sm:text-3xl"
          >
            — —
          </div>
          {pendingNote && <p className="mt-1.5 text-xs text-muted-foreground">{pendingNote}</p>}
          <span className="sr-only">{i18n.t("statTile.pending")}</span>
        </div>
      ) : (
        <div>
          <div className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div>
          {delta && <div className="mt-1.5 text-xs text-muted-foreground">{delta}</div>}
        </div>
      )}
    </Card>
  );
}
