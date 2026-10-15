import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartLegend, ChartTooltipBox } from "@/components/charts/ChartTooltip";
import { formatAxisMoney, formatMoney, formatMonth } from "@/lib/format";

import type { InvestmentMonth } from "../queries";

const SERIES = {
  net: { key: "net", label: "Capitale versato", color: "var(--chart-1)" },
  value: { key: "value", label: "Valore del conto", color: "var(--chart-3)" },
  dividends: { key: "dividends", label: "Dividendi", color: "var(--chart-4)" },
};

interface Row {
  month: string;
  net: number;
  value: number | null;
  deposits: number;
  withdrawals: number;
  dividends: number;
}

const axisProps = {
  tickLine: false,
  tick: { fill: "var(--chart-ink-muted)", fontSize: 12 },
} as const;

/**
 * Capitale versato (a gradini) e valore del conto a fine mese. Il valore c'è solo dove
 * esiste un'istantanea: lo storico si accumula da quando il conto è collegato.
 */
export function CapitalChart({ months }: { months: InvestmentMonth[] }) {
  const rows: Row[] = months.map((m) => ({
    month: m.month,
    net: Number(m.net_deposited_eur),
    value: m.value_eur === null ? null : Number(m.value_eur),
    deposits: Number(m.deposits_eur),
    withdrawals: Number(m.withdrawals_eur),
    dividends: Number(m.dividends_eur),
  }));
  return (
    <div className="space-y-3">
      <ChartLegend items={[SERIES.net, SERIES.value]} />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatMonth(m, "short")}
              axisLine={{ stroke: "var(--chart-axis)" }}
              interval="preserveStartEnd"
              {...axisProps}
            />
            <YAxis
              tickFormatter={formatAxisMoney}
              axisLine={false}
              width={64}
              domain={[(min: number) => Math.min(0, min), "auto"]}
              {...axisProps}
            />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)" }}
              content={({ active, payload, label }) => {
                const row = payload[0]?.payload as Row | undefined;
                if (!active || !row) return null;
                return (
                  <ChartTooltipBox
                    title={formatMonth(String(label), "long")}
                    rows={[
                      { ...SERIES.net, value: row.net },
                      ...(row.value !== null ? [{ ...SERIES.value, value: row.value }] : []),
                      ...(row.deposits
                        ? [{ key: "dep", label: "Versato nel mese", value: row.deposits }]
                        : []),
                      ...(row.withdrawals
                        ? [{ key: "wd", label: "Prelevato nel mese", value: -row.withdrawals }]
                        : []),
                    ]}
                  />
                );
              }}
            />
            <Line
              type="stepAfter"
              dataKey="net"
              stroke={SERIES.net.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={SERIES.value.color}
              strokeWidth={2}
              dot={{ r: 4, fill: SERIES.value.color, strokeWidth: 2, stroke: "var(--card)" }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <DataTable rows={rows} />
    </div>
  );
}

/** Dividendi ricevuti mese per mese. */
export function DividendsChart({ months }: { months: InvestmentMonth[] }) {
  const rows = months.map((m) => ({ month: m.month, dividends: Number(m.dividends_eur) }));
  // Importi piccoli: con l'abbreviazione le etichette dell'asse si ripeterebbero.
  const small = Math.max(...rows.map((r) => r.dividends), 0) < 100;
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="month"
            tickFormatter={(m: string) => formatMonth(m, "short")}
            axisLine={{ stroke: "var(--chart-axis)" }}
            interval="preserveStartEnd"
            {...axisProps}
          />
          <YAxis
            tickFormatter={(v: number) => (small ? formatMoney(v) : formatAxisMoney(v))}
            axisLine={false}
            width={small ? 64 : 56}
            tickCount={4}
            {...axisProps}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload, label }) => {
              const value = payload[0]?.value;
              if (!active || typeof value !== "number") return null;
              return (
                <ChartTooltipBox
                  title={formatMonth(String(label), "long")}
                  rows={[{ ...SERIES.dividends, value }]}
                />
              );
            }}
          />
          <Bar
            dataKey="dividends"
            fill={SERIES.dividends.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DataTable({ rows }: { rows: Row[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
        Tabella dei dati
      </summary>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="py-1.5 font-medium">
              Mese
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Versato nel mese
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Capitale versato
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Valore
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Dividendi
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-b last:border-0">
              <th scope="row" className="py-1.5 text-left font-normal">
                {formatMonth(r.month)}
              </th>
              <td data-sensitive className="num py-1.5 text-right">
                {formatMoney(r.deposits - r.withdrawals, "EUR", { signed: true })}
              </td>
              <td data-sensitive className="num py-1.5 text-right">
                {formatMoney(r.net)}
              </td>
              <td data-sensitive className="num py-1.5 text-right">
                {r.value === null ? "—" : formatMoney(r.value)}
              </td>
              <td data-sensitive className="num py-1.5 text-right">
                {formatMoney(r.dividends)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
