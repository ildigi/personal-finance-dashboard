import { useTranslation } from "react-i18next";

import { Money } from "@/components/common/Money";
import { formatPercent } from "@/lib/format";

import type { NetWorthChange } from "./queries";

/** Variazione a N giorni: il totale se il confronto regge, altrimenti la sola liquidità. */
export function ChangeNote({ change }: { change: NetWorthChange | undefined }) {
  const { t } = useTranslation();
  if (!change) return <>{t("netWorthChange.tooShort")}</>;
  if (change.delta_eur !== null) {
    return (
      <>
        <Money value={change.delta_eur} signed />
        {change.delta_pct !== null &&
          ` (${formatPercent(change.delta_pct / 100, { signed: true })})`}{" "}
        {t("netWorthChange.inDays", { count: change.days })}
      </>
    );
  }
  if (change.cash_delta_eur !== null) {
    return (
      <>
        {t("netWorthChange.cash")} <Money value={change.cash_delta_eur} signed />{" "}
        {t("netWorthChange.inDays", { count: change.days })}
      </>
    );
  }
  return <>{t("netWorthChange.unavailable")}</>;
}
