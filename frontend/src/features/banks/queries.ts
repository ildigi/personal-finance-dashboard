import { useMutation, useQuery } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/api/client";
import { useInvalidateAfterSync } from "@/features/sync/queries";

export type Bank = Schemas["BankRead"];
export type BankCallback = Schemas["CallbackResponse"];

export const bankKeys = {
  status: ["banks", "status"] as const,
  list: (country: string) => ["banks", "aspsps", country] as const,
};

/** Credenziali Enable Banking presenti? (Nessuna chiamata esterna.) */
export function useBanksStatus() {
  return useQuery({
    queryKey: bankKeys.status,
    queryFn: () => unwrap(api.GET("/api/banks/status")),
  });
}

export function useBanks(country: string, enabled: boolean) {
  return useQuery({
    queryKey: bankKeys.list(country),
    queryFn: () => unwrap(api.GET("/api/banks/aspsps", { params: { query: { country } } })),
    enabled,
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Avvia il consenso e porta il browser sulla pagina della banca (login e conferma lì).
 * Nuova banca: `aspsp_name`; rinnovo: `source_id`.
 */
export function useAuthorizeBank() {
  return useMutation({
    mutationFn: (body: Schemas["AuthorizeRequest"]) =>
      unwrap(api.POST("/api/banks/authorize", { body })),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

/** Ritorno dalla banca: salva il consenso e fa la prima sincronizzazione. */
export function useBankCallback() {
  const invalidate = useInvalidateAfterSync();
  return useMutation({
    mutationFn: (body: Schemas["CallbackRequest"]) =>
      unwrap(api.POST("/api/banks/callback", { body })),
    onSuccess: invalidate,
  });
}

/** Giorni che mancano alla scadenza del consenso (negativi = già scaduto). */
export function consentDaysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000);
}

/** Si avvisa 14 giorni prima della scadenza (SPEC §9). */
export const CONSENT_WARNING_DAYS = 14;

/** Scollega una banca: revoca il consenso; con `deleteData` elimina anche conti e movimenti. */
export function useDisconnectBank() {
  const invalidate = useInvalidateAfterSync();
  return useMutation({
    mutationFn: ({ sourceId, deleteData }: { sourceId: number; deleteData: boolean }) =>
      unwrap(
        api.DELETE("/api/banks/sources/{source_id}", {
          params: { path: { source_id: sourceId }, query: { delete_data: deleteData } },
        }),
      ),
    onSuccess: invalidate,
  });
}
