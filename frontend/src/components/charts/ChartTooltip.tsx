import type { ReactNode } from "react";

import { formatMoney } from "@/lib/format";

export interface TooltipRow {
  key: string;
  label: string;
  value: number;
  color?: string;
  /** Riga di riepilogo (es. totale), separata dalle altre. */
  emphasis?: boolean;
}

/** Riquadro del tooltip: testo in inchiostro normale, il colore solo nel segno accanto. */
export function ChartTooltipBox({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <div className="mb-1.5 font-medium">{title}</div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li
            key={row.key}
            className={
              row.emphasis
                ? "mt-1.5 flex items-center justify-between gap-4 border-t pt-1.5 font-medium"
                : "flex items-center justify-between gap-4"
            }
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {row.color && (
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: row.color }}
                />
              )}
              <span className="truncate">{row.label}</span>
            </span>
            <span data-sensitive className="num whitespace-nowrap">
              {formatMoney(row.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legenda in HTML: sempre presente con due o più serie. */
export function ChartLegend({ items }: { items: { key: string; label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
