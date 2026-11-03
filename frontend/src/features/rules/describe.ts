import { kindLabel } from "@/features/transactions/labels";
import { accountLabel, type Lookups } from "@/features/transactions/lookups";
import { formatMoney } from "@/lib/format";

import type { RuleActions, RuleConditions } from "./queries";

/** Le condizioni di una regola in parole: «descrizione contiene "netflix"» · uscite · … */
export function describeConditions(
  c: RuleConditions,
  lookups: Lookups,
  merchantNames: Map<number, string>,
): string[] {
  const parts: string[] = [];
  if (c.merchant_id != null)
    parts.push(`merchant ${merchantNames.get(c.merchant_id) ?? `#${String(c.merchant_id)}`}`);
  if (c.description_contains) parts.push(`descrizione contiene «${c.description_contains}»`);
  if (c.description_regex) parts.push(`descrizione corrisponde a /${c.description_regex}/`);
  if (c.counterparty_iban) parts.push("IBAN controparte indicato");
  if (c.account_id != null)
    parts.push(`conto ${accountLabel(lookups.accountById.get(c.account_id))}`);
  if (c.direction) parts.push(c.direction === "out" ? "uscite" : "entrate");
  if (c.amounts?.length) parts.push(`importo ${c.amounts.map((a) => formatMoney(a)).join(" / ")}`);
  if (c.amount_min != null && c.amount_max != null) {
    parts.push(`importo tra ${formatMoney(c.amount_min)} e ${formatMoney(c.amount_max)}`);
  } else if (c.amount_min != null) {
    parts.push(`importo da ${formatMoney(c.amount_min)}`);
  } else if (c.amount_max != null) {
    parts.push(`importo fino a ${formatMoney(c.amount_max)}`);
  }
  if (c.mcc) parts.push(`MCC ${c.mcc}`);
  return parts;
}

/** Cosa fa la regola: «Abbonamenti › iCloud», «tipo Commissione», … */
export function describeActions(a: RuleActions, lookups: Lookups): string[] {
  const parts: string[] = [];
  if (a.category_id != null) {
    const category = lookups.categoryById.get(a.category_id);
    const sub =
      a.subcategory_id != null ? lookups.subcategoryById.get(a.subcategory_id) : undefined;
    parts.push(
      sub ? `${category?.name ?? "?"} › ${sub.name}` : (category?.name ?? "categoria rimossa"),
    );
  }
  if (a.kind) parts.push(`tipo ${kindLabel(a.kind)}`);
  if (a.income_type_id != null) {
    parts.push(lookups.incomeTypeById.get(a.income_type_id)?.label ?? "tipologia rimossa");
  }
  if (a.tag_ids?.length) parts.push(`${String(a.tag_ids.length)} tag`);
  return parts;
}
