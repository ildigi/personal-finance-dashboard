import { useMemo } from "react";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/api/client";
import { invalidateClassification } from "@/features/rules/queries";

export type Merchant = Schemas["MerchantWithStats"];
export type MerchantUpdate = Schemas["MerchantUpdate"];

export function useMerchants(q: string, { limit = 50, usedOnly = true } = {}) {
  return useQuery({
    queryKey: ["merchants", "list", q, limit, usedOnly],
    queryFn: () =>
      unwrap(
        api.GET("/api/merchants", {
          params: { query: { q: q || undefined, limit, used_only: usedOnly } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** Nomi di tutti i merchant (anche senza movimenti), per descrivere le regole. */
export function useMerchantNames(): Map<number, string> {
  const { data } = useMerchants("", { limit: 500, usedOnly: false });
  return useMemo(() => new Map((data?.items ?? []).map((m) => [m.id, m.name])), [data]);
}

export function useUpdateMerchant() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: MerchantUpdate }) =>
      unwrap(
        api.PATCH("/api/merchants/{merchant_id}", {
          params: { path: { merchant_id: id } },
          body,
        }),
      ),
    // Resta "in corso" finché l'elenco non è aggiornato: il nome appena scritto (dalle
    // `variables`) resta visibile e quello vecchio non ricompare per un attimo.
    onSuccess: () => {
      invalidateClassification(client);
      return client.refetchQueries(
        { queryKey: ["merchants", "list"], type: "active" },
        { cancelRefetch: false },
      );
    },
  });
}

export function useMergeMerchant() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, intoId }: { id: number; intoId: number }) =>
      unwrap(
        api.POST("/api/merchants/{merchant_id}/merge", {
          params: { path: { merchant_id: id } },
          body: { into_id: intoId },
        }),
      ),
    onSuccess: () => {
      invalidateClassification(client);
    },
  });
}
