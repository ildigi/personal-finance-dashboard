import { kindLabel } from "@/features/transactions/labels";
import { accountLabel, type Lookups } from "@/features/transactions/lookups";
import { formatMoney } from "@/lib/format";

import type { RuleActions, RuleConditions } from "./queries";
import { i18n } from "@/i18n";

/** Le condizioni di una regola in parole: «descrizione contiene "netflix"» · uscite · … */
export function describeConditions(
  c: RuleConditions,
  lookups: Lookups,
  merchantNames: Map<number, string>,
): string[] {
  const parts: string[] = [];
  if (c.merchant_id != null)
    parts.push(
      i18n.t("rules.describe.merchant", {
        name: merchantNames.get(c.merchant_id) ?? `#${String(c.merchant_id)}`,
      }),
    );
  if (c.description_contains)
    parts.push(i18n.t("rules.describe.contains", { text: c.description_contains }));
  if (c.description_regex)
    parts.push(i18n.t("rules.describe.regex", { regex: c.description_regex }));
  if (c.counterparty_iban) parts.push(i18n.t("rules.describe.iban"));
  if (c.account_id != null)
    parts.push(
      i18n.t("rules.describe.account", {
        name: accountLabel(lookups.accountById.get(c.account_id)),
      }),
    );
  if (c.direction)
    parts.push(c.direction === "out" ? i18n.t("rules.describe.out") : i18n.t("rules.describe.in"));
  if (c.amounts?.length)
    parts.push(
      i18n.t("rules.describe.amounts", {
        amounts: c.amounts.map((a) => formatMoney(a)).join(" / "),
      }),
    );
  if (c.amount_min != null && c.amount_max != null) {
    parts.push(
      i18n.t("rules.describe.between", {
        min: formatMoney(c.amount_min),
        max: formatMoney(c.amount_max),
      }),
    );
  } else if (c.amount_min != null) {
    parts.push(i18n.t("rules.describe.from", { min: formatMoney(c.amount_min) }));
  } else if (c.amount_max != null) {
    parts.push(i18n.t("rules.describe.upTo", { max: formatMoney(c.amount_max) }));
  }
  if (c.mcc) parts.push(i18n.t("rules.describe.mcc", { mcc: c.mcc }));
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
      sub
        ? `${category?.name ?? "?"} › ${sub.name}`
        : (category?.name ?? i18n.t("rules.describe.removedCategory")),
    );
  }
  if (a.kind) parts.push(i18n.t("rules.describe.kind", { kind: kindLabel(a.kind) }));
  if (a.income_type_id != null) {
    parts.push(
      lookups.incomeTypeById.get(a.income_type_id)?.label ??
        i18n.t("rules.describe.removedIncomeType"),
    );
  }
  if (a.tag_ids?.length) parts.push(i18n.t("rules.describe.tags", { n: a.tag_ids.length }));
  return parts;
}
