import { LogOut, ShieldCheck, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

import { useAuthSessions, useAuthStatus, useLogout } from "./queries";

/** Riconoscibile nell'elenco: browser e sistema, senza dettagli superflui. */
function device(agent: string | null): string {
  if (!agent) return "Dispositivo sconosciuto";
  const browser = agent.includes("Edg/")
    ? "Edge"
    : agent.includes("Chrome/")
      ? "Chrome"
      : agent.includes("Firefox/")
        ? "Firefox"
        : agent.includes("Safari/")
          ? "Safari"
          : "Browser";
  const os = agent.includes("Android")
    ? "Android"
    : /iPhone|iPad/.test(agent)
      ? "iPhone/iPad"
      : agent.includes("Windows")
        ? "Windows"
        : agent.includes("Mac OS X")
          ? "Mac"
          : agent.includes("Linux")
            ? "Linux"
            : "";
  return os ? `${browser} su ${os}` : browser;
}

export function AccessCard() {
  const status = useAuthStatus();
  const enabled = status.data?.enabled === true;
  const sessions = useAuthSessions(enabled && status.data?.authenticated === true);
  const logout = useLogout();
  const logoutAll = useLogout(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accesso</CardTitle>
        <CardDescription>Password e codice dell'app di autenticazione</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!status.data ? (
          <Skeleton className="h-10 w-full" />
        ) : !enabled ? (
          <div className="flex gap-2.5">
            <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              Spento: la dashboard è raggiungibile solo da questo computer. Sul server di casa si
              attiva con{" "}
              <code className="rounded bg-muted px-1 text-xs whitespace-nowrap">
                AUTH_ENABLED=true
              </code>{" "}
              dopo{" "}
              <code className="rounded bg-muted px-1 text-xs whitespace-nowrap">
                python -m app.auth.cli setup
              </code>
              .
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-2.5">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-status-good" />
              <p>Attivo: serve password + codice su ogni dispositivo nuovo.</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sessioni aperte</p>
              <ul className="divide-y rounded-lg border">
                {(sessions.data ?? []).map((s) => (
                  <li key={s.created_at} className="px-3 py-2">
                    <span className="font-medium">{device(s.user_agent)}</span>
                    <span className="block text-xs text-muted-foreground">
                      ultimo uso {formatDateTime(s.last_seen_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={logout.isPending}
                onClick={() => {
                  logout.mutate();
                }}
              >
                <LogOut aria-hidden /> Esci
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={logoutAll.isPending}
                onClick={() => {
                  logoutAll.mutate();
                }}
              >
                Esci da tutti i dispositivi
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
