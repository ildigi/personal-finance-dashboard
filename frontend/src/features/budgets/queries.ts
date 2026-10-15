import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/api/client";

export type BudgetOverview = Schemas["BudgetOverview"];
export type BudgetStatus = Schemas["BudgetStatus"];
export type BudgetMonth = Schemas["BudgetMonth"];
export type BudgetCreate = Schemas["BudgetCreate"];
export type BudgetUpdate = Schemas["BudgetUpdate"];

export const budgetKeys = {
  all: ["budgets"] as const,
  month: (month: string | null) => ["budgets", "month", month ?? "current"] as const,
  suggestion: (categoryId: number, subcategoryId: number | null) =>
    ["budgets", "suggestion", categoryId, subcategoryId] as const,
};

/** `month` = "AAAA-MM", null = mese corrente. */
export function useBudgets(month: string | null = null) {
  return useQuery({
    queryKey: budgetKeys.month(month),
    queryFn: () =>
      unwrap(api.GET("/api/budgets", { params: { query: { month: month ?? undefined } } })),
    placeholderData: keepPreviousData,
  });
}

export function useBudgetSuggestion(categoryId: number | null, subcategoryId: number | null) {
  return useQuery({
    queryKey: budgetKeys.suggestion(categoryId ?? 0, subcategoryId),
    queryFn: () =>
      unwrap(
        api.GET("/api/budgets/suggestion", {
          params: {
            query: { category_id: categoryId ?? 0, subcategory_id: subcategoryId ?? undefined },
          },
        }),
      ),
    enabled: categoryId !== null,
  });
}

function useBudgetMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: budgetKeys.all });
    },
  });
}

export function useCreateBudget() {
  return useBudgetMutation((body: BudgetCreate) => unwrap(api.POST("/api/budgets", { body })));
}

export function useUpdateBudget() {
  return useBudgetMutation(({ id, body }: { id: number; body: BudgetUpdate }) =>
    unwrap(api.PATCH("/api/budgets/{budget_id}", { params: { path: { budget_id: id } }, body })),
  );
}

export function useDeleteBudget() {
  return useBudgetMutation(async (id: number) => {
    const { response } = await api.DELETE("/api/budgets/{budget_id}", {
      params: { path: { budget_id: id } },
    });
    if (!response.ok) throw new Error("Eliminazione non riuscita");
  });
}
