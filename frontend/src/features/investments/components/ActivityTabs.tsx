import { Link2 } from "lucide-react";
import { useState } from "react";

import { Money } from "@/components/common/Money";
import { formatCount, formatDate, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { InvestmentActivity } from "../queries";
import { i18n } from "@/i18n";

type Tab = "orders" | "dividends" | "flows";

/** Tipi con un nome in `investments.activity.flowTypes`; gli altri restano col codice. */
const FLOW_TYPES = ["deposit", "withdrawal", "interest", "fee"] as const;

function flowLabel(type: string): string {
  return (FLOW_TYPES as readonly string[]).includes(type)
    ? i18n.t(`investments.activity.flowTypes.${type as (typeof FLOW_TYPES)[number]}`)
    : type;
}
const PAGE = 15;

function day(iso: string): string {
  return formatDate(iso.slice(0, 10));
}

/** Ordini eseguiti, dividendi e movimenti di cassa, a schede. */
export function ActivityTabs({ activity }: { activity: InvestmentActivity }) {
  const [tab, setTab] = useState<Tab>("orders");
  const [shown, setShown] = useState(PAGE);
  const tabs: { key: Tab; label: string; count: number }[] = [
    {
      key: "orders",
      label: i18n.t("investments.activity.tabs.orders"),
      count: activity.orders.length,
    },
    {
      key: "dividends",
      label: i18n.t("investments.activity.tabs.dividends"),
      count: activity.dividends.length,
    },
    {
      key: "flows",
      label: i18n.t("investments.activity.tabs.flows"),
      count: activity.cash_flows.length,
    },
  ];
  const total = tabs.find((t) => t.key === tab)?.count ?? 0;

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label={i18n.t("investments.activity.title")}
        className="flex gap-1 border-b"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setShown(PAGE);
            }}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label} <span className="text-xs text-muted-foreground">{formatCount(t.count)}</span>
          </button>
        ))}
      </div>

      <ul role="tabpanel" className="divide-y text-sm">
        {tab === "orders" &&
          activity.orders.slice(0, shown).map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-2.5">
              <span
                className={cn(
                  "w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium",
                  o.side === "buy" ? "bg-primary/10 text-primary" : "bg-muted text-foreground",
                )}
              >
                {o.side === "buy"
                  ? i18n.t("investments.activity.buy")
                  : i18n.t("investments.activity.sell")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.name ?? o.ticker}</span>
                <span className="text-xs text-muted-foreground">
                  {day(o.executed_at)} · <span data-sensitive>{formatQuantity(o.quantity)}</span>{" "}
                  {i18n.t("investments.positions.sharesShort")}
                  {o.fees_eur && Number(o.fees_eur) > 0 && (
                    <>
                      {" "}
                      · {i18n.t("investments.activity.fee")} <Money value={o.fees_eur} />
                    </>
                  )}
                </span>
              </span>
              <Money
                value={o.side === "buy" ? `-${o.value_eur}` : o.value_eur}
                signed
                className="num"
              />
            </li>
          ))}
        {tab === "dividends" &&
          activity.dividends.slice(0, shown).map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{d.name ?? d.ticker}</span>
                <span className="text-xs text-muted-foreground">{formatDate(d.paid_on)}</span>
              </span>
              <Money value={d.amount_eur} signed tone="auto" className="num" />
            </li>
          ))}
        {tab === "flows" &&
          activity.cash_flows.slice(0, shown).map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block">{flowLabel(f.type)}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {day(f.occurred_at)}
                  {f.transaction_id !== null && (
                    <span className="inline-flex items-center gap-1">
                      · <Link2 aria-hidden className="size-3" />{" "}
                      {i18n.t("investments.activity.matched")}
                    </span>
                  )}
                </span>
              </span>
              <Money
                value={
                  f.type === "withdrawal" || f.type === "fee" ? `-${f.amount_eur}` : f.amount_eur
                }
                signed
                tone="auto"
                className="num"
              />
            </li>
          ))}
        {total === 0 && (
          <li className="py-6 text-center text-muted-foreground">
            {i18n.t("investments.activity.nothing")}
          </li>
        )}
      </ul>
      {shown < total && (
        <button
          type="button"
          onClick={() => {
            setShown((n) => n + PAGE * 2);
          }}
          className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          {i18n.t("investments.activity.more", { n: formatCount(total - shown) })}
        </button>
      )}
    </div>
  );
}
