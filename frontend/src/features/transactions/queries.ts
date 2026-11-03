import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { i18n } from "@/i18n";
import { api, unwrap, type Schemas } from "@/api/client";
import { invalidateClassification } from "@/features/rules/queries";
import { queryKeys } from "@/features/system/queries";
import type { DateRange } from "@/lib/period";

import type { TransactionFilters } from "./filters";

export type Transaction = Schemas["TransactionRead"];
export type TransactionDetail = Schemas["TransactionDetail"];
export type TransactionCreate = Schemas["TransactionCreate"];

export const PAGE_SIZE = 50;

export const transactionKeys = {
  all: ["transactions"] as const,
  list: (filters: TransactionFilters, range: DateRange) =>
    ["transactions", "list", filters, range] as const,
  detail: (id: number) => ["transactions", "detail", id] as const,
};

export function useTransactions(filters: TransactionFilters, range: DateRange) {
  return useInfiniteQuery({
    queryKey: transactionKeys.list(filters, range),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/transactions", {
          params: {
            query: {
              date_from: range.from,
              date_to: range.to,
              q: filters.q || undefined,
              account_id: filters.account ? [filters.account] : undefined,
              kind: filters.kind ? [filters.kind] : undefined,
              category_id: filters.category ?? undefined,
              subcategory_id: filters.subcategory ?? undefined,
              merchant_id: filters.merchant ?? undefined,
              rule_id: filters.rule ?? undefined,
              recurring_id: filters.recurring ?? undefined,
              income_type_id: filters.incomeType ?? undefined,
              status: filters.status ?? undefined,
              unclassified: filters.uncategorized ? true : undefined,
              sort: filters.sort,
              limit: PAGE_SIZE,
              offset: pageParam,
            },
          },
        }),
      ),
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
    placeholderData: keepPreviousData,
  });
}

export function useTransaction(id: number | null) {
  return useQuery({
    queryKey: transactionKeys.detail(id ?? 0),
    queryFn: () =>
      unwrap(
        api.GET("/api/transactions/{transaction_id}", {
          params: { path: { transaction_id: id ?? 0 } },
        }),
      ),
    enabled: id !== null,
  });
}

export function useCreateTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TransactionCreate) => unwrap(api.POST("/api/transactions", { body })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: transactionKeys.all });
      void client.invalidateQueries({ queryKey: ["analytics"] });
      void client.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export function useDeleteTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { response } = await api.DELETE("/api/transactions/{transaction_id}", {
        params: { path: { transaction_id: id } },
      });
      if (!response.ok) throw new Error(i18n.t("errors.deleteFailed"));
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: transactionKeys.all });
      void client.invalidateQueries({ queryKey: queryKeys.accounts });
      void client.invalidateQueries({ queryKey: ["analytics"] });
      void client.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export type TransactionUpdate = Schemas["TransactionUpdate"];
export type LearnSuggestion = Schemas["LearnSuggestion"];
export type BulkUpdate = Schemas["TransactionBulkUpdate"];

/** Correzione manuale; il dettaglio torna aggiornato e si ricalcola ciò che ne dipende. */
export function useUpdateTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: TransactionUpdate }) =>
      unwrap(
        api.PATCH("/api/transactions/{transaction_id}", {
          params: { path: { transaction_id: id } },
          body,
        }),
      ),
    onSuccess: (tx) => {
      client.setQueryData(transactionKeys.detail(tx.id), tx);
      invalidateClassification(client);
    },
  });
}

/** Proposta "applicare anche ai movimenti simili?" dopo una correzione. */
export function useLearnSuggestion(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["transactions", "learn", id],
    queryFn: () =>
      unwrap(
        api.GET("/api/transactions/{transaction_id}/learn", {
          params: { path: { transaction_id: id ?? 0 } },
        }),
      ),
    enabled: enabled && id !== null,
  });
}

export function useLearn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope }: { id: number; scope: Schemas["LearnScope"] }) =>
      unwrap(
        api.POST("/api/transactions/{transaction_id}/learn", {
          params: { path: { transaction_id: id } },
          body: { scope },
        }),
      ),
    onSuccess: () => {
      invalidateClassification(client);
    },
  });
}

export function useBulkUpdate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkUpdate) => unwrap(api.POST("/api/transactions/bulk", { body })),
    onSuccess: () => {
      invalidateClassification(client);
    },
  });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: () => unwrap(api.GET("/api/tags")) });
}

export function useCreateTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => unwrap(api.POST("/api/tags", { body: { name } })),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

/** Toglie le correzioni di classificazione (le note restano) e riclassifica. */
export function useResetClassification() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(
        api.DELETE("/api/transactions/{transaction_id}/overrides", {
          params: { path: { transaction_id: id } },
        }),
      ),
    onSuccess: (tx) => {
      client.setQueryData(transactionKeys.detail(tx.id), tx);
      invalidateClassification(client);
    },
  });
}
