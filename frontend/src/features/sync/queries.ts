import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/api/client";
import { i18n } from "@/i18n";
import { queryKeys } from "@/features/system/queries";
import { transactionKeys } from "@/features/transactions/queries";

export type Source = Schemas["SourceRead"];
export type SyncSummary = Schemas["SyncSummaryRead"];

export const syncKeys = {
  sources: ["sources"] as const,
  logs: ["sync-logs"] as const,
};

export function useSources() {
  return useQuery({
    queryKey: syncKeys.sources,
    queryFn: () => unwrap(api.GET("/api/sources")),
  });
}

export function useSyncLogs(limit = 20) {
  return useQuery({
    queryKey: [...syncKeys.logs, limit],
    queryFn: () => unwrap(api.GET("/api/sync-logs", { params: { query: { limit } } })),
  });
}

/** Dopo una sincronizzazione tutto ciò che dipende dai dati va ricaricato. */
export function useInvalidateAfterSync() {
  const client = useQueryClient();
  return () => {
    for (const key of [
      syncKeys.sources,
      syncKeys.logs,
      queryKeys.accounts,
      transactionKeys.all,
      ["analytics"],
      ["recurring"],
      ["budgets"],
      ["investments"],
      ["networth"],
      ["trading212"],
    ]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };
}

export function useSyncSource() {
  const invalidate = useInvalidateAfterSync();
  return useMutation({
    mutationFn: (sourceId: number) =>
      unwrap(
        api.POST("/api/sources/{source_id}/sync", { params: { path: { source_id: sourceId } } }),
      ),
    onSuccess: invalidate,
  });
}

export function useTrading212Status() {
  return useQuery({
    queryKey: ["trading212", "status"],
    queryFn: () => unwrap(api.GET("/api/sources/trading212/status")),
  });
}

/** Collega il conto Trading 212 (chiave nel file dei segreti) e fa la prima sincronizzazione. */
export function useConnectTrading212() {
  const invalidate = useInvalidateAfterSync();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/sources/trading212")),
    onSuccess: invalidate,
  });
}

export function useSetupMockData() {
  const invalidate = useInvalidateAfterSync();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/mock/setup")),
    onSuccess: invalidate,
  });
}

/** "12 nuovi, 3 aggiornati" a partire dal riepilogo di una sync. */
export function describeSummary(summary: SyncSummary): string {
  if (summary.status === "error") {
    return summary.jobs.find((j) => j.error)?.error ?? i18n.t("connections.summary.failed");
  }
  const tx = summary.jobs.find((j) => j.job === "transactions");
  const orders = summary.jobs.find((j) => j.job === "orders");
  if (orders) {
    return orders.created === 0
      ? i18n.t("connections.summary.portfolioUpdated")
      : i18n.t("connections.summary.portfolioOrders", { count: orders.created });
  }
  const created = summary.jobs.reduce((n, j) => n + j.created, 0);
  if (tx) {
    return tx.created === 0 && tx.updated === 0
      ? i18n.t("connections.summary.noNewTransactions")
      : i18n.t("connections.summary.transactions", { count: tx.created, updated: tx.updated });
  }
  return created === 0
    ? i18n.t("connections.summary.upToDate")
    : i18n.t("connections.summary.items", { count: created });
}
