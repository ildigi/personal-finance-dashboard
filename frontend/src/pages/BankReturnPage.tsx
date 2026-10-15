import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBankCallback } from "@/features/banks/queries";
import { describeSummary } from "@/features/sync/queries";

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
            ? "Nessun collegamento in corso"
            : callback.isError
              ? "Collegamento non riuscito"
              : result
                ? `${result.institution} collegata`
                : "Collegamento della banca…"}
        </CardTitle>
        <CardDescription>
          {!state
            ? "Questa pagina si apre al ritorno dalla banca, dopo l'autorizzazione."
            : callback.isError
              ? callback.error.message
              : result
                ? `${String(result.accounts)} ${result.accounts === 1 ? "conto autorizzato" : "conti autorizzati"} · ${describeSummary(result.sync)}`
                : "Salvo il consenso e scarico conti, saldi e movimenti."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {result && (
          <Button asChild>
            <Link to="/movimenti">Vai ai movimenti</Link>
          </Button>
        )}
        <Button asChild variant={result ? "outline" : "default"}>
          <Link to="/impostazioni">Torna alle impostazioni</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
