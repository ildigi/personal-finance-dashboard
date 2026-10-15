import { shiftMonth } from "@/features/budgets/month";

import type { InvestmentMonth } from "./queries";

/**
 * Serie mensile continua dal primo mese con dati fino a `until` ("AAAA-MM"): i mesi senza
 * movimenti ripetono il capitale versato del mese prima e non hanno valore.
 */
export function fillMonths(months: InvestmentMonth[], until: string): InvestmentMonth[] {
  const first = months[0];
  if (!first) return [];
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const filled: InvestmentMonth[] = [];
  let net = "0.00";
  for (let key = first.month; key <= until; key = shiftMonth(key, 1)) {
    const found = byMonth.get(key);
    if (found) net = found.net_deposited_eur;
    filled.push(
      found ?? {
        month: key,
        deposits_eur: "0.00",
        withdrawals_eur: "0.00",
        dividends_eur: "0.00",
        interest_eur: "0.00",
        bought_eur: "0.00",
        sold_eur: "0.00",
        net_deposited_eur: net,
        value_eur: null,
      },
    );
  }
  return filled;
}
