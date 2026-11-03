import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, detailOf, unwrap, type Schemas } from "@/api/client";
import { i18n } from "@/i18n";

export type AuthStatus = Schemas["AuthStatus"];
export type AuthSession = Schemas["SessionRead"];

export const authKeys = {
  status: ["auth", "status"] as const,
  sessions: ["auth", "sessions"] as const,
};

export function useAuthStatus() {
  return useQuery({
    queryKey: authKeys.status,
    queryFn: () => unwrap(api.GET("/api/auth/status")),
    staleTime: 60_000,
  });
}

export function useAuthSessions(enabled: boolean) {
  return useQuery({
    queryKey: authKeys.sessions,
    queryFn: () => unwrap(api.GET("/api/auth/sessions")),
    enabled,
  });
}

/** Risposte senza corpo (204): errore leggibile se non va a buon fine. */
async function noContent(request: Promise<{ error?: unknown; response: Response }>): Promise<void> {
  let result: Awaited<typeof request>;
  try {
    result = await request;
  } catch {
    throw new ApiError(0, i18n.t("errors.backendUnreachable"));
  }
  if (result.response.ok) return;
  throw new ApiError(
    result.response.status,
    detailOf(result.error) ?? i18n.t("errors.status", { status: result.response.status }),
  );
}

/** Dopo login o uscita i dati in memoria non valgono più: si riparte da zero. */
function useResetAll() {
  const client = useQueryClient();
  return () => {
    client.clear();
    void client.invalidateQueries({ queryKey: authKeys.status });
  };
}

export function useLogin() {
  const reset = useResetAll();
  return useMutation({
    mutationFn: (body: Schemas["LoginRequest"]) => noContent(api.POST("/api/auth/login", { body })),
    onSuccess: reset,
  });
}

export function useLogout(everywhere = false) {
  const reset = useResetAll();
  return useMutation({
    mutationFn: () =>
      noContent(everywhere ? api.POST("/api/auth/logout-all") : api.POST("/api/auth/logout")),
    onSuccess: reset,
  });
}
