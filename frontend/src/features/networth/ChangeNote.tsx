import { Money } from "@/components/common/Money";
import { formatPercent } from "@/lib/format";

import type { NetWorthChange } from "./queries";

/** Variazione a N giorni: il totale se il confronto regge, altrimenti la sola liquidità. */
export function ChangeNote({ change }: { change: NetWorthChange | undefined }) {
  if (!change) return <>storico troppo breve per un confronto</>;
  if (change.delta_eur !== null) {
    return (
      <>
        <Money value={change.delta_eur} signed />
        {change.delta_pct !== null &&
          ` (${formatPercent(change.delta_pct / 100, { signed: true })})`}{" "}
        in {change.days} giorni
      </>
    );
  }
  if (change.cash_delta_eur !== null) {
    return (
      <>
        liquidità <Money value={change.cash_delta_eur} signed /> in {change.days} giorni
      </>
    );
  }
  return <>confronto non disponibile: mancano dati di allora</>;
}
