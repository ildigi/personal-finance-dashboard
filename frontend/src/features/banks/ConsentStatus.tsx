import { Button } from "@/components/ui/button";
import type { Source } from "@/features/sync/queries";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CONSENT_WARNING_DAYS, consentDaysLeft, useAuthorizeBank } from "./queries";

/**
 * Scadenza del consenso di una banca. Da 14 giorni prima (o se è già scaduto) compare
 * «Rinnova consenso», che riporta all'app della banca per confermare di nuovo.
 */
export function ConsentStatus({ source }: { source: Source }) {
  const authorize = useAuthorizeBank();
  if (source.provider !== "enablebanking") return null;
  const expires = source.consent_expires_at;
  const days = expires ? consentDaysLeft(expires) : null;
  const expired = source.status === "expired" || (days !== null && days < 0);
  const warn = expired || (days !== null && days <= CONSENT_WARNING_DAYS);

  return (
    <>
      <span className={cn(warn && "font-medium text-status-warning")}>
        {expired
          ? "Consenso scaduto: rinnovalo per leggere i movimenti nuovi"
          : expires
            ? `consenso fino al ${formatDate(expires.slice(0, 10))}${
                warn ? ` · scade tra ${String(days)} giorni` : ""
              }`
            : "consenso da autorizzare"}
      </span>
      {warn && (
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={authorize.isPending}
          onClick={() => {
            authorize.mutate({ source_id: source.id });
          }}
        >
          {authorize.isPending ? "Apertura della banca…" : "Rinnova consenso"}
        </Button>
      )}
      {authorize.isError && <span className="text-destructive">{authorize.error.message}</span>}
    </>
  );
}
