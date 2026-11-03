import { LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { i18n } from "@/i18n";
import { formatDateTime } from "@/lib/format";

import { useAuthSessions, useAuthStatus, useLogout } from "./queries";

/** Riconoscibile nell'elenco: browser e sistema, senza dettagli superflui. */
function device(agent: string | null): string {
  if (!agent) return i18n.t("access.unknownDevice");
  const browser = agent.includes("Edg/")
    ? "Edge"
    : agent.includes("Chrome/")
      ? "Chrome"
      : agent.includes("Firefox/")
        ? "Firefox"
        : agent.includes("Safari/")
          ? "Safari"
          : i18n.t("common.browser");
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
  return os ? i18n.t("access.deviceOn", { browser, os }) : browser;
}

export function AccessCard() {
  const { t } = useTranslation();
  const status = useAuthStatus();
  const enabled = status.data?.enabled === true;
  const sessions = useAuthSessions(enabled && status.data?.authenticated === true);
  const logout = useLogout();
  const logoutAll = useLogout(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("access.title")}</CardTitle>
        <CardDescription>{t("access.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!status.data ? (
          <Skeleton className="h-10 w-full" />
        ) : !enabled ? (
          <div className="flex gap-2.5">
            <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              <Trans
                i18nKey="access.off"
                components={{
                  code: <code className="rounded bg-muted px-1 text-xs whitespace-nowrap" />,
                }}
              />
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-2.5">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-status-good" />
              <p>{t("access.on")}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t("access.sessions")}
              </p>
              <ul className="divide-y rounded-lg border">
                {(sessions.data ?? []).map((s) => (
                  <li key={s.created_at} className="px-3 py-2">
                    <span className="font-medium">{device(s.user_agent)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("access.lastUsed", { when: formatDateTime(s.last_seen_at) })}
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
                <LogOut aria-hidden /> {t("access.logout")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={logoutAll.isPending}
                onClick={() => {
                  logoutAll.mutate();
                }}
              >
                {t("access.logoutAll")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
