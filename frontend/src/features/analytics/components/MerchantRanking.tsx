import { Store } from "lucide-react";
import { Link } from "react-router";

import { Money } from "@/components/common/Money";
import { transactionsUrl } from "@/features/transactions/filters";
import { describeClassification, type Lookups } from "@/features/transactions/lookups";
import { formatCount, formatDate } from "@/lib/format";

import type { MerchantTotal } from "../queries";

/** Classifica dei merchant: spesa, frequenza, importo medio, ultimo acquisto. */
export function MerchantRanking({ rows, lookups }: { rows: MerchantTotal[]; lookups: Lookups }) {
  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Store aria-hidden className="size-4" />
        Nessun merchant con spese nel periodo
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">
              Merchant
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Totale
            </th>
            <th scope="col" className="hidden py-2 pr-3 text-right font-medium sm:table-cell">
              Volte
            </th>
            <th scope="col" className="hidden py-2 pr-3 text-right font-medium sm:table-cell">
              Media
            </th>
            <th scope="col" className="hidden py-2 text-right font-medium md:table-cell">
              Ultimo
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.merchant_id} className="border-b last:border-0">
              <td className="max-w-0 py-2.5 pr-3">
                <Link
                  to={transactionsUrl({ merchant: m.merchant_id })}
                  className="block truncate font-medium hover:underline"
                >
                  {m.name}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {describeClassification(
                    {
                      kind: "expense",
                      category_id: m.category_id,
                      subcategory_id: null,
                      income_type_id: null,
                    },
                    lookups,
                  )}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-right">
                <Money value={m.total_eur} className="num font-medium" />
              </td>
              <td className="num hidden py-2.5 pr-3 text-right text-muted-foreground sm:table-cell">
                {formatCount(m.count)}
              </td>
              <td className="hidden py-2.5 pr-3 text-right text-muted-foreground sm:table-cell">
                <Money value={m.average_eur} className="num" />
              </td>
              <td className="num hidden py-2.5 text-right text-muted-foreground md:table-cell">
                {formatDate(m.last_date, "short")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
