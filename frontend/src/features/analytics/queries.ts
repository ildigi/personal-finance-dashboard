import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/api/client";
import type { DateRange } from "@/lib/period";

export type ExpensesSummary = Schemas["ExpensesSummary"];
export type CategoryTotal = Schemas["CategoryTotal"];
export type IncomeSummary = Schemas["IncomeSummary"];
export type MonthPoint = Schemas["MonthPoint"];
export type MerchantTotal = Schemas["MerchantTotal"];

export const analyticsKeys = {
  all: ["analytics"] as const,
  expenses: (range: DateRange) => ["analytics", "expenses", range] as const,
  income: (range: DateRange) => ["analytics", "income", range] as const,
  monthly: (months: number) => ["analytics", "monthly", months] as const,
  merchants: (range: DateRange) => ["analytics", "merchants", range] as const,
};

export function useExpenses(range: DateRange) {
  return useQuery({
    queryKey: analyticsKeys.expenses(range),
    queryFn: () =>
      unwrap(
        api.GET("/api/analytics/expenses", {
          params: { query: { date_from: range.from, date_to: range.to } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useIncome(range: DateRange) {
  return useQuery({
    queryKey: analyticsKeys.income(range),
    queryFn: () =>
      unwrap(
        api.GET("/api/analytics/income", {
          params: { query: { date_from: range.from, date_to: range.to } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useMonthly(months: number) {
  return useQuery({
    queryKey: analyticsKeys.monthly(months),
    queryFn: () => unwrap(api.GET("/api/analytics/monthly", { params: { query: { months } } })),
    placeholderData: keepPreviousData,
  });
}

export function useMerchantRanking(range: DateRange) {
  return useQuery({
    queryKey: analyticsKeys.merchants(range),
    queryFn: () =>
      unwrap(
        api.GET("/api/analytics/merchants", {
          params: { query: { date_from: range.from, date_to: range.to, limit: 10 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}
