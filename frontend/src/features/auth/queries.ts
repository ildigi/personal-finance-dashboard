import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, unwrap, type Schemas } from "@/api/client";

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
    throw new ApiError(0, "Backend non raggiungibile");
  }
  if (result.response.ok) return;
  const detail =
    result.error && typeof result.error === "object" && "detail" in result.error
      ? result.error.detail
      : null;
  throw new ApiError(
    result.response.status,
    typeof detail === "string" ? detail : `Errore ${String(result.response.status)}`,
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
