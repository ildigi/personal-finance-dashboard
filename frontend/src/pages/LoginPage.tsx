import { KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Trans } from "react-i18next";
import { Navigate, useNavigate, useSearchParams } from "react-router";

import { ApiError } from "@/api/client";
import { BrandMark } from "@/components/common/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStatus, useLogin } from "@/features/auth/queries";
import { i18n } from "@/i18n";

/** Solo percorsi interni: niente redirect verso altri siti tramite l'indirizzo. */
function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/** Accesso con password + codice dell'app di autenticazione (solo sul server). */
export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("da"));
  const navigate = useNavigate();
  const status = useAuthStatus();
  const login = useLogin();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = i18n.t("common.documentTitle", {
      page: i18n.t("login.documentTitle"),
      app: i18n.t("common.appName"),
    });
  }, []);

  if (status.data && (!status.data.enabled || status.data.authenticated)) {
    return <Navigate to={next} replace />;
  }

  function submit(event: SyntheticEvent): void {
    event.preventDefault();
    login.mutate(
      { password, code: code.replace(/\s/g, "") },
      {
        onSuccess: () => {
          void navigate(next, { replace: true });
        },
        onError: () => {
          setCode("");
          codeRef.current?.focus();
        },
      },
    );
  }

  const error = login.error instanceof ApiError ? login.error : null;
  const notConfigured = status.data?.enabled === true && !status.data.configured;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <BrandMark className="mx-auto mb-2 size-10" />
          <CardTitle>
            <h1 className="text-xl">{i18n.t("login.title")}</h1>
          </CardTitle>
          <CardDescription>{i18n.t("login.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {notConfigured ? (
            <p className="text-sm text-muted-foreground">
              <Trans
                i18nKey="login.notConfigured"
                components={{
                  code: <code className="rounded bg-muted px-1 py-0.5 text-xs whitespace-nowrap" />,
                }}
              />
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">{i18n.t("login.password")}</Label>
                <div className="relative">
                  <LockKeyhole
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                    }}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">{i18n.t("login.code")}</Label>
                <div className="relative">
                  <KeyRound
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    ref={codeRef}
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9 ]{6,8}"
                    maxLength={8}
                    required
                    placeholder="123 456"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                    }}
                    className="num pl-9 tracking-widest"
                  />
                </div>
              </div>
              <p role="alert" className="min-h-5 text-sm text-destructive">
                {error?.message ?? ""}
              </p>
              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending && <LoaderCircle aria-hidden className="animate-spin" />}
                {i18n.t("login.submit")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
