import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/api/client";

export type Rule = Schemas["RuleRead"];
export type RuleConditions = Schemas["RuleConditions"];
export type RuleActions = Schemas["RuleActions"];
export type RuleCreate = Schemas["RuleCreate"];
export type RulePreview = Schemas["RulePreview"];
export type TransferSuggestion = Schemas["TransferSuggestion"];
export type ClassificationStats = Schemas["ClassificationStats"];

export const ruleKeys = {
  rules: ["rules"] as const,
  stats: ["classification-stats"] as const,
  suggestions: ["transfer-suggestions"] as const,
};

/**
 * Ogni modifica a regole, merchant, categorie o correzioni può cambiare la
 * classificazione di molti movimenti: si invalidano tutti i dati che ne dipendono.
 */
export function invalidateClassification(client: QueryClient): void {
  for (const key of [
    ["transactions"],
    ["analytics"],
    ["rules"],
    ["classification-stats"],
    ["transfer-suggestions"],
    ["merchants"],
    ["categories"],
    // Le ricorrenze si ricalcolano dopo ogni classificazione; i budget ne dipendono.
    ["recurring"],
    ["budgets"],
  ]) {
    void client.invalidateQueries({ queryKey: key });
  }
}

export function useRules() {
  return useQuery({ queryKey: ruleKeys.rules, queryFn: () => unwrap(api.GET("/api/rules")) });
}

export function useClassificationStats() {
  return useQuery({
    queryKey: ruleKeys.stats,
    queryFn: () => unwrap(api.GET("/api/classification/stats")),
  });
}

export function useTransferSuggestions() {
  return useQuery({
    queryKey: ruleKeys.suggestions,
    queryFn: () => unwrap(api.GET("/api/transfers/suggestions")),
  });
}

function useClassificationMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      invalidateClassification(client);
    },
  });
}

export function useSaveRule() {
  return useClassificationMutation(({ id, body }: { id: number | null; body: RuleCreate }) =>
    id === null
      ? unwrap(api.POST("/api/rules", { body }))
      : unwrap(api.PATCH("/api/rules/{rule_id}", { params: { path: { rule_id: id } }, body })),
  );
}

export function useToggleRule() {
  return useClassificationMutation(({ id, active }: { id: number; active: boolean }) =>
    unwrap(
      api.PATCH("/api/rules/{rule_id}", {
        params: { path: { rule_id: id } },
        body: { is_active: active },
      }),
    ),
  );
}

export function useDeleteRule() {
  return useClassificationMutation(async (id: number) => {
    const { response } = await api.DELETE("/api/rules/{rule_id}", {
      params: { path: { rule_id: id } },
    });
    if (!response.ok) throw new Error("Eliminazione non riuscita");
  });
}

export function useReorderRules() {
  return useClassificationMutation((ruleIds: number[]) =>
    unwrap(api.POST("/api/rules/reorder", { body: { rule_ids: ruleIds } })),
  );
}

export function usePreviewRule() {
  return useMutation({
    mutationFn: (body: Schemas["RulePreviewRequest"]) =>
      unwrap(api.POST("/api/rules/preview", { body })),
  });
}

export function useRunClassification() {
  return useClassificationMutation(() => unwrap(api.POST("/api/classification/run")));
}

export function usePairTransfer() {
  return useClassificationMutation((pair: { out_id: number; in_id: number }) =>
    unwrap(api.POST("/api/transfers", { body: pair })),
  );
}

export function useDismissTransfer() {
  return useClassificationMutation((pair: { out_id: number; in_id: number }) =>
    unwrap(api.POST("/api/transfers/dismiss", { body: pair })),
  );
}
