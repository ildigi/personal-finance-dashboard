import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { onUnauthorized } from "@/api/client";

import { authKeys, useAuthStatus } from "./queries";

/**
 * Con l'accesso attivo (sul server) chi non ha una sessione va alla pagina di accesso.
 * In locale l'accesso è spento e la dashboard si apre subito, senza aspettare.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const status = useAuthStatus();
  const { pathname, search } = useLocation();

  // Una risposta 401 (sessione scaduta o chiusa altrove): si ricontrolla lo stato.
  useEffect(
    () =>
      onUnauthorized(() => {
        void client.invalidateQueries({ queryKey: authKeys.status });
      }),
    [client],
  );

  const data = status.data;
  if (data?.enabled && !data.authenticated) {
    const next = encodeURIComponent(`${pathname}${search}`);
    return <Navigate to={`/accesso?da=${next}`} replace />;
  }
  return children;
}
