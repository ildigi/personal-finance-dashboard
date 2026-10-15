import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartLegend, ChartTooltipBox } from "@/components/charts/ChartTooltip";
import { formatAxisMoney, formatDate, formatMoney, formatMonth } from "@/lib/format";

import { spans, type NetWorthPoint } from "./queries";

const NETWORTH_SERIES = {
  cash: { key: "cash", label: "Liquidità", color: "var(--chart-1)" },
  investments: { key: "investments", label: "Investimenti", color: "var(--chart-3)" },
  estimated: { key: "estimated", label: "Investimenti (stima)", color: "var(--chart-3)" },
};

interface Row {
  date: string;
  cash: number;
  investments: number;
  /** Investimenti stimati col capitale versato: serie a parte, tratteggiata. */
  estimatedInvestments: number;
  total: number;
  partial: boolean;
  estimated: boolean;
}

const axisProps = {
  tickLine: false,
  tick: { fill: "var(--chart-ink-muted)", fontSize: 12 },
} as const;

/** Etichetta dell'asse con un importo: in modalità privacy si sfoca come gli altri importi. */
function MoneyTick(props: { x?: number; y?: number; payload?: { value: number } }) {
  return (
    <text
      x={props.x}
      y={props.y}
      dy={4}
      textAnchor="end"
      fill="var(--chart-ink-muted)"
      fontSize={12}
      data-sensitive
    >
      {formatAxisMoney(props.payload?.value ?? 0)}
    </text>
  );
}

/**
 * Liquidità e investimenti impilati, giorno per giorno: l'altezza totale è il patrimonio.
 * Ombreggiati i tratti parziali (un conto non ha ancora dati) e quelli con gli
 * investimenti stimati dal capitale versato.
 */
export function NetWorthChart({
  points,
  compact = false,
}: {
  points: NetWorthPoint[];
  compact?: boolean;
}) {
  const rows: Row[] = points.map((p) => ({
    date: p.date,
    cash: Number(p.cash_eur),
    investments: p.estimated ? 0 : Number(p.investments_eur),
    estimatedInvestments: p.estimated ? Number(p.investments_eur) : 0,
    total: Number(p.total_eur),
    partial: p.partial,
    estimated: p.estimated,
  }));
  const partial = spans(points, (p) => p.partial);
  const anyEstimated = points.some((p) => p.estimated);
  const longRange = rows.length > 120;
  const ticks = longRange ? monthTicks(rows) : undefined;

  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          NETWORTH_SERIES.cash,
          NETWORTH_SERIES.investments,
          ...(anyEstimated ? [NETWORTH_SERIES.estimated] : []),
        ]}
      />
      <div className={compact ? "h-44 w-full" : "h-72 w-full"}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            {partial.map((s) => (
              <ReferenceArea
                key={`${s.from}-${s.to}`}
                x1={s.from}
                x2={s.to}
                fill="var(--muted)"
                fillOpacity={0.6}
                stroke="none"
                ifOverflow="extendDomain"
              />
            ))}
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) =>
                longRange ? formatMonth(d.slice(0, 7), "short") : formatDate(d, "short")
              }
              axisLine={{ stroke: "var(--chart-axis)" }}
              ticks={ticks}
              interval={ticks ? 0 : "preserveStartEnd"}
              minTickGap={ticks ? 0 : 32}
              {...axisProps}
            />
            {!compact && (
              <YAxis
                tick={<MoneyTick />}
                tickLine={false}
                axisLine={false}
                width={64}
                domain={[(min: number) => Math.min(0, min), "auto"]}
              />
            )}
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)" }}
              content={({ active, payload }) => {
                const row = payload[0]?.payload as Row | undefined;
                if (!active || !row) return null;
                const note = row.partial
                  ? "Manca qualche conto: il totale è parziale"
                  : row.estimated
                    ? "Investimenti stimati con il capitale versato"
                    : null;
                return (
                  <ChartTooltipBox
                    title={
                      <span>
                        {formatDate(row.date, "long")}
                        {note && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {note}
                          </span>
                        )}
                      </span>
                    }
                    rows={[
                      { ...NETWORTH_SERIES.cash, value: row.cash },
                      row.estimated
                        ? { ...NETWORTH_SERIES.estimated, value: row.estimatedInvestments }
                        : { ...NETWORTH_SERIES.investments, value: row.investments },
                      { key: "total", label: "Patrimonio netto", value: row.total },
                    ]}
                  />
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="cash"
              stackId="nw"
              stroke={NETWORTH_SERIES.cash.color}
              strokeWidth={2}
              fill={NETWORTH_SERIES.cash.color}
              fillOpacity={0.18}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="investments"
              stackId="nw"
              stroke={NETWORTH_SERIES.investments.color}
              strokeWidth={2}
              fill={NETWORTH_SERIES.investments.color}
              fillOpacity={0.18}
              isAnimationActive={false}
            />
            {anyEstimated && (
              <Area
                type="monotone"
                dataKey="estimatedInvestments"
                stackId="nw"
                stroke={NETWORTH_SERIES.estimated.color}
                strokeWidth={2}
                strokeDasharray="4 3"
                fill={NETWORTH_SERIES.estimated.color}
                fillOpacity={0.07}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {!compact && <DataTable rows={rows} />}
    </div>
  );
}

/** Un'etichetta per mese (il primo giorno presente); oltre 8 mesi, un mese sì e uno no. */
function monthTicks(rows: Row[]): string[] {
  const firsts = rows
    .filter((r, i) => i === 0 || rows[i - 1]?.date.slice(0, 7) !== r.date.slice(0, 7))
    .map((r) => r.date);
  return firsts.length > 8 ? firsts.filter((_, i) => i % 2 === 0) : firsts;
}

/** Tabella dei dati: l'ultimo giorno di ogni mese (e oggi). */
function DataTable({ rows }: { rows: Row[] }) {
  const monthly = rows.filter(
    (r, i) => i === rows.length - 1 || rows[i + 1]?.date.slice(0, 7) !== r.date.slice(0, 7),
  );
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
        Tabella dei dati
      </summary>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="py-1.5 font-medium">
              Giorno
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Liquidità
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Investimenti
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Totale
            </th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((r) => (
            <tr key={r.date} className="border-b last:border-0">
              <th scope="row" className="py-1.5 text-left font-normal">
                {formatDate(r.date)}
                {(r.partial || r.estimated) && (
                  <span className="ml-1 text-muted-foreground">
                    ({r.partial ? "parziale" : "stima"})
                  </span>
                )}
              </th>
              <td data-sensitive className="num py-1.5 text-right">
                {formatMoney(r.cash)}
              </td>
              <td data-sensitive className="num py-1.5 text-right">
                {formatMoney(r.investments + r.estimatedInvestments)}
              </td>
              <td data-sensitive className="num py-1.5 text-right">
                {formatMoney(r.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
