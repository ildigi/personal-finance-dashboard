import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartTooltipBox } from "@/components/charts/ChartTooltip";
import { formatAxisMoney, formatMoney, formatMonth } from "@/lib/format";

import type { MonthPoint } from "../queries";
import { i18n } from "@/i18n";

const SERIES = [
  { key: "income", color: "var(--chart-1)" },
  { key: "expenses", color: "var(--chart-2)" },
] as const;

const seriesLabel = (key: (typeof SERIES)[number]["key"]): string =>
  key === "income" ? i18n.t("analytics.income") : i18n.t("analytics.realExpenses");

interface Row {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

/** Entrate e spese reali mese per mese, affiancate; il saldo è nel tooltip e in tabella. */
export function IncomeVsExpensesChart({ months }: { months: MonthPoint[] }) {
  const series = SERIES.map((s) => ({ ...s, label: seriesLabel(s.key) }));
  const rows: Row[] = months.map((m) => ({
    month: m.month,
    income: Number(m.income_eur),
    expenses: Number(m.expenses_eur),
    net: Number(m.net_eur),
  }));
  return (
    <div className="space-y-3">
      <ChartLegend items={series} />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={2}>
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
                const row = payload[0]?.payload as Row | undefined;
                if (!active || !row) return null;
                return (
                  <ChartTooltipBox
                    title={formatMonth(String(label), "long")}
                    rows={[
                      { ...SERIES[0], label: seriesLabel("income"), value: row.income },
                      { ...SERIES[1], label: seriesLabel("expenses"), value: row.expenses },
                      {
                        key: "net",
                        label: i18n.t("analytics.net"),
                        value: row.net,
                        emphasis: true,
                      },
                    ]}
                  />
                );
              }}
            />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
          {i18n.t("analytics.dataTable")}
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-1.5 font-medium">
                {i18n.t("analytics.month")}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {i18n.t("analytics.income")}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {i18n.t("analytics.realExpenses")}
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                {i18n.t("analytics.net")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b last:border-0">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {formatMonth(r.month)}
                </th>
                {[r.income, r.expenses, r.net].map((v, i) => (
                  <td key={i} data-sensitive className="num py-1.5 text-right">
                    {formatMoney(v, "EUR", { signed: i === 2 })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
