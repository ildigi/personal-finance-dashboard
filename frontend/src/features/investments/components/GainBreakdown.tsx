import { Money } from "@/components/common/Money";
import { formatMoney } from "@/lib/format";

import type { InvestmentScope } from "@/lib/preferences";

import type { InvestmentSummary } from "../queries";

/**
 * Da dove viene il guadagno: ogni voce sommata (o sottratta) fa il guadagno totale,
 * cioè valore attuale meno capitale versato. Tabella, non grafico: sono poche voci con segno.
 * Con "Solo attivi" le voci sono le posizioni in mano e il totale è il loro valore − costo.
 */
export function GainBreakdown({
  summary,
  scope = "all",
}: {
  summary: InvestmentSummary;
  scope?: InvestmentScope;
}) {
  if (scope === "active") return <ActiveBreakdown summary={summary} />;
  const b = summary.breakdown;
  const rows = [
    {
      key: "unrealized",
      label: "Plusvalenze sulle posizioni aperte",
      hint: "valore attuale − costo, non ancora incassate",
      value: Number(b.unrealized_eur),
    },
    {
      key: "realized",
      label: "Realizzato dalle vendite",
      hint: "ribilanciamenti e vendite, col costo medio",
      value: Number(b.realized_eur),
    },
    {
      key: "dividends",
      label: "Dividendi",
      hint: "netti, ricevuti",
      value: Number(b.dividends_eur),
    },
    {
      key: "interest",
      label: "Interessi sulla liquidità",
      hint: null,
      value: Number(b.interest_eur),
    },
    {
      key: "fees",
      label: "Commissioni",
      hint: "es. conversione valuta",
      value: -Number(b.fees_eur),
    },
    {
      key: "other",
      label: "Altro",
      hint: "cambi, arrotondamenti, eventi societari",
      value: Number(b.other_eur),
    },
  ].filter((r) => Math.abs(r.value) >= 0.005 || r.key === "unrealized" || r.key === "realized");

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Scomposizione del guadagno totale</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b last:border-0">
            <th scope="row" className="py-2 pr-3 text-left font-normal">
              {r.label}
              {r.hint && <span className="block text-xs text-muted-foreground">{r.hint}</span>}
            </th>
            <td data-sensitive className="num py-2 text-right whitespace-nowrap">
              {formatMoney(r.value, "EUR", { signed: true })}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2">
          <th scope="row" className="pt-2.5 text-left font-medium">
            Guadagno totale
          </th>
          <td className="pt-2.5 text-right font-semibold">
            <Money value={summary.returns.total_pl_eur} signed tone="auto" />
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function ActiveBreakdown({ summary }: { summary: InvestmentSummary }) {
  const rows = [...summary.positions].sort((a, b) => Number(b.pl_eur) - Number(a.pl_eur));
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Guadagno delle posizioni in mano, per titolo</caption>
      <tbody>
        {rows.map((p) => (
          <tr key={p.ticker} className="border-b last:border-0">
            <th scope="row" className="py-2 pr-3 text-left font-normal">
              <span className="line-clamp-1">{p.name ?? p.ticker}</span>
            </th>
            <td data-sensitive className="num py-2 text-right whitespace-nowrap">
              {formatMoney(p.pl_eur, "EUR", { signed: true })}
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td className="py-4 text-center text-muted-foreground">Nessuna posizione aperta</td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className="border-t-2">
          <th scope="row" className="pt-2.5 text-left font-medium">
            Guadagno sulle posizioni in mano
          </th>
          <td className="pt-2.5 text-right font-semibold">
            <Money value={summary.active.pl_eur} signed tone="auto" />
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
