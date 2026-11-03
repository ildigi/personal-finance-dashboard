import { useQuery } from "@tanstack/react-query";

import { i18n } from "@/i18n";
import { api, ApiError, unwrap, type Health } from "@/api/client";

export const queryKeys = {
  health: ["health"] as const,
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
  incomeTypes: ["income-types"] as const,
};

function isHealth(value: unknown): value is Health {
  return typeof value === "object" && value !== null && "status" in value && "database" in value;
}

/** Il 503 di /api/health (database irraggiungibile) ha comunque un corpo utile: lo si legge. */
export async function fetchHealth(): Promise<Health> {
  const result = await api.GET("/api/health").catch(() => undefined);
  if (!result) throw new ApiError(0, i18n.t("errors.backendUnreachable"));
  if (result.data) return result.data;
  const body: unknown = result.error;
  if (result.response.status === 503 && isHealth(body)) return body;
  throw new ApiError(result.response.status, i18n.t("errors.backendUnreachable"));
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: () => unwrap(api.GET("/api/accounts")),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => unwrap(api.GET("/api/categories")),
    staleTime: 5 * 60_000,
  });
}

export function useIncomeTypes() {
  return useQuery({
    queryKey: queryKeys.incomeTypes,
    queryFn: () => unwrap(api.GET("/api/income-types")),
    staleTime: 5 * 60_000,
  });
}
