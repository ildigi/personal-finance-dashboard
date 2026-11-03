import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartLegend, ChartTooltipBox } from "@/components/charts/ChartTooltip";
import { formatMoney, formatPercent } from "@/lib/format";

import { OTHER_COLOR, OTHER_KEY, type CategoryColors } from "../colors";
import type { CategoryTotal } from "../queries";
import { i18n } from "@/i18n";

const MAX_SEGMENTS = 5;

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Composizione delle spese a colpo d'occhio: al massimo 5 categorie + "Altre"
 * (oltre, i confronti si fanno sulle barre). Al centro il totale.
 */
export function CategoryDonut({
  categories,
  colors,
  total,
}: {
  categories: CategoryTotal[];
  colors: CategoryColors;
  total: number;
}) {
  const positive = categories.filter((c) => Number(c.total_eur) > 0);
  const top = positive.filter((c) => colors.isNamed(c.category_id)).slice(0, MAX_SEGMENTS);
  const topIds = new Set(top.map((c) => c.category_id));
  const rest = positive
    .filter((c) => !topIds.has(c.category_id))
    .reduce((sum, c) => sum + Number(c.total_eur), 0);
  const slices: Slice[] = [
    ...top.map((c) => ({
      key: String(c.category_id),
      label: c.name,
      value: Number(c.total_eur),
      color: colors.colorOf(c.category_id),
    })),
    ...(rest > 0
      ? [{ key: OTHER_KEY, label: i18n.t("analytics.others"), value: rest, color: OTHER_COLOR }]
      : []),
  ];
  const sum = slices.reduce((acc, s) => acc + s.value, 0);

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-60">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices.map((s) => ({ ...s, fill: s.color }))}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              stroke="var(--card)"
              strokeWidth={2}
              cornerRadius={3}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                const slice = payload[0]?.payload as Slice | undefined;
                if (!active || !slice) return null;
                return (
                  <ChartTooltipBox
                    title={slice.label}
                    rows={[
                      {
                        key: "v",
                        label: formatPercent(sum ? slice.value / sum : 0),
                        value: slice.value,
                        color: slice.color,
                      },
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground">{i18n.t("analytics.realExpenses")}</span>
          <span data-sensitive className="text-lg font-semibold tracking-tight">
            {formatMoney(total)}
          </span>
        </div>
      </div>
      <ChartLegend items={slices} />
    </div>
  );
}
