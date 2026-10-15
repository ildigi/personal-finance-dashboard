import { ArrowRight, Check, Link2, X } from "lucide-react";

import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { accountLabel, type Lookups } from "@/features/transactions/lookups";
import { formatDate } from "@/lib/format";

import { useDismissTransfer, usePairTransfer, type TransferSuggestion } from "../queries";

/**
 * Coppie possibili (importi opposti, date vicine, conti diversi) ma senza indizi
 * che le confermino: decidi tu (SPEC §11, "abbinamenti incerti").
 */
export function TransferSuggestionsCard({
  suggestions,
  lookups,
}: {
  suggestions: TransferSuggestion[];
  lookups: Lookups;
}) {
  const pair = usePairTransfer();
  const dismiss = useDismissTransfer();
  const busy = pair.isPending || dismiss.isPending;
  if (suggestions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 aria-hidden className="size-4 text-muted-foreground" />
          Trasferimenti da confermare
        </CardTitle>
        <CardDescription>
          Stesso importo, date vicine, due tuoi conti: sono un giroconto? Se confermi non contano né
          come spesa né come entrata.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {suggestions.map(({ outflow, inflow }) => {
            const ids = { out_id: outflow.id, in_id: inflow.id };
            return (
              <li
                key={`${String(outflow.id)}-${String(inflow.id)}`}
                className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center"
              >
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
                  {[outflow, inflow].map((tx, index) => (
                    <div key={tx.id} className={index === 1 ? "order-3 min-w-0" : "min-w-0"}>
                      <Money value={tx.amount} signed tone="auto" className="num font-medium" />
                      <div className="truncate text-xs text-muted-foreground">
                        {formatDate(tx.booking_date, "short")} ·{" "}
                        {accountLabel(lookups.accountById.get(tx.account_id))}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {tx.description_clean}
                      </div>
                    </div>
                  ))}
                  <ArrowRight aria-hidden className="order-2 size-4 text-muted-foreground" />
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      dismiss.mutate(ids);
                    }}
                  >
                    <X aria-hidden />
                    No, sono separati
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      pair.mutate(ids);
                    }}
                  >
                    <Check aria-hidden />
                    Sì, è un giroconto
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
