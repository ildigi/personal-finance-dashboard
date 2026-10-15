import { PieChart } from "lucide-react";
import { useState } from "react";

import { Money } from "@/components/common/Money";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { InvestmentPosition } from "../queries";

type SortKey = "weight" | "pl";

const QTY = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6, useGrouping: "always" });

function priceText(value: string, currency: string): string {
  return formatMoney(value, currency);
}

function PlCell({ position }: { position: InvestmentPosition }) {
  return (
    <span className="whitespace-nowrap">
      <Money value={position.pl_eur} signed tone="auto" />
      {position.pl_pct !== null && (
        <span className="ml-1.5 text-xs text-muted-foreground">
          {formatPercent(position.pl_pct / 100, { signed: true })}
        </span>
      )}
    </span>
  );
}

function WeightBar({ pct }: { pct: number }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="num text-xs">{formatPercent(pct / 100)}</span>
      <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-primary/15">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${String(pct)}%` }}
        />
      </span>
    </span>
  );
}

function Name({ position }: { position: InvestmentPosition }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{position.name ?? position.ticker}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {position.ticker}
        {position.pie_name && (
          <span className="inline-flex items-center gap-1">
            · <PieChart aria-hidden className="size-3" /> {position.pie_name}
          </span>
        )}
      </span>
    </span>
  );
}

/** Posizioni aperte: tabella da PC, schede da telefono; ordinabili per peso o risultato. */
export function PositionsTable({ positions }: { positions: InvestmentPosition[] }) {
  const [sort, setSort] = useState<SortKey>("weight");
  const wide = useMediaQuery("(min-width: 768px)");
  const rows = [...positions].sort((a, b) =>
    sort === "weight" ? b.weight_pct - a.weight_pct : Number(b.pl_eur) - Number(a.pl_eur),
  );

  const toggle = (
    <div role="group" aria-label="Ordina per" className="flex gap-1 text-xs">
      {(
        [
          ["weight", "Peso"],
          ["pl", "Risultato"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={sort === key}
          onClick={() => {
            setSort(key);
          }}
          className={cn(
            "rounded-full px-2.5 py-1 font-medium transition-colors",
            sort === key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (positions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">Nessuna posizione aperta</p>
    );
  }

  if (!wide) {
    return (
      <div className="space-y-3">
        {toggle}
        <ul className="divide-y">
          {rows.map((p) => (
            <li key={p.ticker} className="space-y-1.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <Name position={p} />
                <Money value={p.value_eur} className="font-medium" />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <PlCell position={p} />
                <WeightBar pct={p.weight_pct} />
              </div>
              <p className="text-xs text-muted-foreground">
                <span data-sensitive>{QTY.format(Number(p.quantity))}</span> quote · medio{" "}
                <span data-sensitive>{priceText(p.avg_price, p.instrument_currency)}</span> · ora{" "}
                {priceText(p.current_price, p.instrument_currency)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toggle}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="py-2 text-left font-medium">
              Strumento
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Quote
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Prezzo medio
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Prezzo attuale
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Valore
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Risultato
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Peso
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.ticker} className="border-b last:border-0">
              <th scope="row" className="max-w-64 py-2.5 pr-3 text-left font-normal">
                <Name position={p} />
              </th>
              <td data-sensitive className="num py-2.5 text-right">
                {QTY.format(Number(p.quantity))}
              </td>
              <td data-sensitive className="num py-2.5 text-right">
                {priceText(p.avg_price, p.instrument_currency)}
              </td>
              <td className="num py-2.5 text-right">
                {priceText(p.current_price, p.instrument_currency)}
              </td>
              <td className="num py-2.5 text-right">
                <Money value={p.value_eur} />
              </td>
              <td className="num py-2.5 pl-3 text-right">
                <PlCell position={p} />
              </td>
              <td className="py-2.5 pl-4 text-right">
                <WeightBar pct={p.weight_pct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
