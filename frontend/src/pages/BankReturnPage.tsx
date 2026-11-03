import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBankCallback } from "@/features/banks/queries";
import { describeSummary } from "@/features/sync/queries";
import { i18n } from "@/i18n";

/**
 * Qui la banca rimanda dopo il consenso, con `code` e `state` (o `error`). Si chiama il
 * backend una sola volta e si toglie il codice dall'indirizzo: ricaricare la pagina non
 * lo riusa.
 */
export function BankReturnPage() {
  const [params] = useSearchParams();
  const callback = useBankCallback();
  const sent = useRef(false);
  const state = params.get("state");

  useEffect(() => {
    if (sent.current || !state) return;
    sent.current = true;
    callback.mutate({
      state,
      code: params.get("code"),
      error: params.get("error"),
      error_description: params.get("error_description"),
    });
    window.history.replaceState(null, "", window.location.pathname);
  }, [callback, params, state]);

  const result = callback.data;
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {!state || callback.isError ? (
            <CircleX aria-hidden className="size-5 text-status-critical" />
          ) : result ? (
            <CircleCheck aria-hidden className="size-5 text-status-good" />
          ) : (
            // Si arriva qui con un caricamento completo della pagina: nei primi istanti l'avvio
            // dell'app occupa il browser e la rotazione scatta. La dissolvenza ritardata nasconde
            // quel tratto; il contenitore HTML ruota su un livello proprio, non l'SVG.
            <span
              aria-hidden
              className="inline-flex size-5 animate-in delay-300 duration-300 fill-mode-backwards fade-in"
            >
              <span className="inline-flex size-5 animate-spin will-change-transform">
                <LoaderCircle className="size-5 text-muted-foreground" />
              </span>
            </span>
          )}
          {!state
            ? i18n.t("bankReturn.noFlow")
            : callback.isError
              ? i18n.t("bankReturn.failed")
              : result
                ? i18n.t("bankReturn.connected", { bank: result.institution })
                : i18n.t("bankReturn.connecting")}
        </CardTitle>
        <CardDescription>
          {!state
            ? i18n.t("bankReturn.noFlowHint")
            : callback.isError
              ? callback.error.message
              : result
                ? `${i18n.t("bankReturn.accounts", { count: result.accounts })} · ${describeSummary(result.sync)}`
                : i18n.t("bankReturn.saving")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {result && (
          <Button asChild>
            <Link to="/movimenti">{i18n.t("bankReturn.toTransactions")}</Link>
          </Button>
        )}
        <Button asChild variant={result ? "outline" : "default"}>
          <Link to="/impostazioni">{i18n.t("bankReturn.toSettings")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
