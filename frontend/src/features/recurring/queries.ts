import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/api/client";

export type Recurring = Schemas["RecurringRead"];
export type RecurringSummary = Schemas["RecurringSummary"];
export type RecurringUpdate = Schemas["RecurringUpdate"];
export type UpcomingCharge = Schemas["UpcomingCharge"];

export interface UpcomingParams {
  days: number;
  direction?: "in" | "out";
  includeSuggested?: boolean;
}

export const recurringKeys = {
  all: ["recurring"] as const,
  list: ["recurring", "list"] as const,
  upcoming: (params: UpcomingParams) => ["recurring", "upcoming", params] as const,
};

export function useRecurring() {
  return useQuery({
    queryKey: recurringKeys.list,
    queryFn: () => unwrap(api.GET("/api/recurring")),
  });
}

export function useUpcoming(params: UpcomingParams) {
  return useQuery({
    queryKey: recurringKeys.upcoming(params),
    queryFn: () =>
      unwrap(
        api.GET("/api/recurring/upcoming", {
          params: {
            query: {
              days: params.days,
              direction: params.direction,
              include_suggested: params.includeSuggested ?? false,
            },
          },
        }),
      ),
  });
}

/** Una ricorrenza confermata cambia abbonamenti/mese, proiezioni dei budget e movimenti. */
function invalidatePlanning(client: QueryClient): void {
  for (const key of [["recurring"], ["budgets"], ["analytics"], ["transactions"]]) {
    void client.invalidateQueries({ queryKey: key });
  }
}

export function useUpdateRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: RecurringUpdate }) =>
      unwrap(
        api.PATCH("/api/recurring/{recurring_id}", {
          params: { path: { recurring_id: id } },
          body,
        }),
      ),
    onSuccess: () => {
      invalidatePlanning(client);
    },
  });
}

/** Dimentica la ricorrenza: se la serie c'è ancora, torna tra le proposte. */
export function useForgetRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { response } = await api.DELETE("/api/recurring/{recurring_id}", {
        params: { path: { recurring_id: id } },
      });
      if (!response.ok) throw new Error("Operazione non riuscita");
    },
    onSuccess: () => {
      invalidatePlanning(client);
    },
  });
}
