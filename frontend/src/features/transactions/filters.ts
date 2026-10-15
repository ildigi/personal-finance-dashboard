import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import type { TransactionKind } from "./labels";

/** Filtri della pagina Movimenti, salvati nell'indirizzo (condivisibili, tasto Indietro). */
export interface TransactionFilters {
  q: string;
  account: number | null;
  kind: TransactionKind | null;
  category: number | null;
  /** Filtri che arrivano dai collegamenti di altre pagine (drill-down, regole, merchant). */
  subcategory: number | null;
  merchant: number | null;
  rule: number | null;
  recurring: number | null;
  incomeType: number | null;
  status: "booked" | "pending" | null;
  /** Movimenti che nessun passo della classificazione ha riconosciuto. */
  uncategorized: boolean;
  sort: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
}

const KINDS: TransactionKind[] = [
  "expense",
  "income",
  "internal_transfer",
  "investment_transfer",
  "refund",
  "fee",
  "other",
];
const SORTS = ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const;

function toId(value: string | null): number | null {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : null;
}

export function parseFilters(params: URLSearchParams): TransactionFilters {
  const kind = params.get("tipo");
  const status = params.get("stato");
  const sort = params.get("ordine");
  return {
    q: params.get("q") ?? "",
    account: toId(params.get("conto")),
    kind: KINDS.includes(kind as TransactionKind) ? (kind as TransactionKind) : null,
    category: toId(params.get("categoria")),
    subcategory: toId(params.get("sottocategoria")),
    merchant: toId(params.get("merchant")),
    rule: toId(params.get("regola")),
    recurring: toId(params.get("ricorrenza")),
    incomeType: toId(params.get("tipologia")),
    status: status === "booked" || status === "pending" ? status : null,
    uncategorized: params.get("da_classificare") === "1",
    sort: (SORTS as readonly string[]).includes(sort ?? "")
      ? (sort as TransactionFilters["sort"])
      : "date_desc",
  };
}

const PARAM: Record<keyof TransactionFilters, string> = {
  q: "q",
  account: "conto",
  kind: "tipo",
  category: "categoria",
  subcategory: "sottocategoria",
  merchant: "merchant",
  rule: "regola",
  recurring: "ricorrenza",
  incomeType: "tipologia",
  status: "stato",
  uncategorized: "da_classificare",
  sort: "ordine",
};

export function useTransactionFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);

  const setFilter = useCallback(
    <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const empty =
            value === null ||
            value === "" ||
            value === false ||
            (key === "sort" && value === "date_desc");
          if (empty) next.delete(PARAM[key]);
          else next.set(PARAM[key], value === true ? "1" : String(value));
          // La sottocategoria vale solo dentro la sua categoria.
          if (key === "category") next.delete(PARAM.subcategory);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  const activeCount =
    Number(filters.q !== "") +
    Number(filters.account !== null) +
    Number(filters.kind !== null) +
    Number(filters.category !== null) +
    Number(filters.subcategory !== null) +
    Number(filters.merchant !== null) +
    Number(filters.rule !== null) +
    Number(filters.recurring !== null) +
    Number(filters.incomeType !== null) +
    Number(filters.status !== null) +
    Number(filters.uncategorized);

  return { filters, setFilter, reset, activeCount };
}

/** Indirizzo della pagina Movimenti con alcuni filtri già impostati. */
export function transactionsUrl(
  filters: Partial<Record<keyof TransactionFilters, string | number | boolean>>,
): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(filters) as (keyof TransactionFilters)[]) {
    const value = filters[key];
    if (value === undefined || value === false || value === "") continue;
    params.set(PARAM[key], value === true ? "1" : String(value));
  }
  const query = params.toString();
  return query ? `/movimenti?${query}` : "/movimenti";
}
