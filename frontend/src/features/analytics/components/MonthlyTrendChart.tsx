import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Category } from "@/api/client";
import { ChartLegend, ChartTooltipBox, type TooltipRow } from "@/components/charts/ChartTooltip";
import { formatAxisMoney, formatMoney, formatMonth } from "@/lib/format";

import { OTHER_COLOR, OTHER_KEY, type CategoryColors } from "../colors";
import type { MonthPoint } from "../queries";

const AVERAGE_KEY = "media";
const AVERAGE_WINDOW = 3;

type Row = Record<string, number | string>;

/**
 * Spese reali per mese, impilate per categoria (7 colori fissi + "Altre"), con la
 * media mobile a 3 mesi. Un solo asse: tutto è in euro.
 */
export function MonthlyTrendChart({
  months,
  colors,
  categoryById,
}: {
  months: MonthPoint[];
  colors: CategoryColors;
  categoryById: Map<number, Category>;
}) {
  const rows = useMemo<Row[]>(
    () =>
      months.map((m, index) => {
        const row: Row = { month: m.month, total: Number(m.expenses_eur), [OTHER_KEY]: 0 };
        for (const c of m.categories) {
          const key = colors.isNamed(c.category_id) ? `c${String(c.category_id)}` : OTHER_KEY;
          row[key] = Number(row[key] ?? 0) + Number(c.total_eur);
        }
        const window = months.slice(Math.max(0, index - AVERAGE_WINDOW + 1), index + 1);
        if (window.length === AVERAGE_WINDOW) {
          row[AVERAGE_KEY] =
            window.reduce((sum, w) => sum + Number(w.expenses_eur), 0) / AVERAGE_WINDOW;
        }
        return row;
      }),
    [months, colors],
  );

  const series = [
    ...colors.named.map((id) => ({
      key: `c${String(id)}`,
      label: categoryById.get(id)?.name ?? "Categoria",
      color: colors.colorOf(id),
    })),
    { key: OTHER_KEY, label: "Altre", color: OTHER_COLOR },
  ];

  return (
    <div className="space-y-3">
      <ChartLegend
        items={[
          ...series,
          { key: AVERAGE_KEY, label: "Media mobile 3 mesi", color: "var(--foreground)" },
        ]}
      />
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatMonth(m, "short")}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-axis)" }}
              tick={{ fill: "var(--chart-ink-muted)", fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatAxisMoney}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--chart-ink-muted)", fontSize: 12 }}
              width={64}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload, label }) => {
                if (!active || payload.length === 0) return null;
                const row = payload[0]?.payload as Row | undefined;
                if (!row) return null;
                const items: TooltipRow[] = series
                  .filter((s) => Number(row[s.key] ?? 0) !== 0)
                  .map((s) => ({ ...s, value: Number(row[s.key]) }))
                  .sort((a, b) => b.value - a.value);
                items.push({
                  key: "total",
                  label: "Totale",
                  value: Number(row.total),
                  emphasis: true,
                });
                if (row[AVERAGE_KEY] !== undefined) {
                  items.push({
                    key: AVERAGE_KEY,
                    label: "Media 3 mesi",
                    value: Number(row[AVERAGE_KEY]),
                  });
                }
                return <ChartTooltipBox title={formatMonth(String(label), "long")} rows={items} />;
              }}
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="spese"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={2}
                radius={2}
                maxBarSize={40}
                isAnimationActive={false}
              />
            ))}
            <Line
              dataKey={AVERAGE_KEY}
              type="monotone"
              stroke="var(--foreground)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
          Tabella dei dati
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Mese
                </th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="py-1.5 pr-3 text-right font-medium">
                    {s.label}
                  </th>
                ))}
                <th scope="col" className="py-1.5 text-right font-medium">
                  Totale
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.month)} className="border-b last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {formatMonth(String(row.month))}
                  </th>
                  {series.map((s) => (
                    <td key={s.key} data-sensitive className="num py-1.5 pr-3 text-right">
                      {formatMoney(Number(row[s.key] ?? 0))}
                    </td>
                  ))}
                  <td data-sensitive className="num py-1.5 text-right font-medium">
                    {formatMoney(Number(row.total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
