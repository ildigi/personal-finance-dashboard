import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/api/client";

export type NetWorthOverview = Schemas["NetWorthOverview"];
export type NetWorthAccount = Schemas["NetWorthAccount"];
export type NetWorthPoint = Schemas["NetWorthPoint"];
export type NetWorthChange = Schemas["NetWorthChange"];

export const networthKeys = {
  all: ["networth"] as const,
  overview: (since: string | null) => ["networth", since] as const,
};

/** Patrimonio di oggi e storico giornaliero da `since` (null = tutto quello che c'è). */
export function useNetWorth(since: string | null) {
  return useQuery({
    queryKey: networthKeys.overview(since),
    queryFn: () =>
      unwrap(api.GET("/api/networth", { params: { query: { since: since ?? undefined } } })),
    // Cambiando intervallo resta il grafico di prima finché arriva il nuovo: niente salti.
    placeholderData: keepPreviousData,
  });
}

export const NETWORTH_RANGES = [
  { key: "3m", months: 3 },
  { key: "6m", months: 6 },
  { key: "1y", months: 12 },
  { key: "all", months: null },
] as const;

export type NetWorthRange = (typeof NETWORTH_RANGES)[number]["key"];

/** Primo giorno dell'intervallo (data ISO), contando i mesi all'indietro da oggi. */
export function rangeStart(range: NetWorthRange, today: string): string | null {
  const months = NETWORTH_RANGES.find((r) => r.key === range)?.months ?? null;
  if (months === null) return null;
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const start = new Date(Date.UTC(y, m - 1 - months, d));
  return start.toISOString().slice(0, 10);
}

/** Tratti consecutivi in cui una condizione vale (per ombreggiare il grafico). */
export function spans(
  points: NetWorthPoint[],
  test: (p: NetWorthPoint) => boolean,
): { from: string; to: string }[] {
  const result: { from: string; to: string }[] = [];
  points.forEach((p, i) => {
    if (!test(p)) return;
    const last = result.at(-1);
    if (last && i > 0 && last.to === points[i - 1]?.date) last.to = p.date;
    else result.push({ from: p.date, to: p.date });
  });
  return result;
}
