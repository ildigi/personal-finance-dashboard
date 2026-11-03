import { Link2 } from "lucide-react";
import { useState } from "react";

import { Money } from "@/components/common/Money";
import { formatCount, formatDate, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { InvestmentActivity } from "../queries";

type Tab = "orders" | "dividends" | "flows";

const FLOW_LABELS: Record<string, string> = {
  deposit: "Versamento",
  withdrawal: "Prelievo",
  interest: "Interessi",
  fee: "Commissione",
};
const PAGE = 15;

function day(iso: string): string {
  return formatDate(iso.slice(0, 10));
}

/** Ordini eseguiti, dividendi e movimenti di cassa, a schede. */
export function ActivityTabs({ activity }: { activity: InvestmentActivity }) {
  const [tab, setTab] = useState<Tab>("orders");
  const [shown, setShown] = useState(PAGE);
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "orders", label: "Ordini", count: activity.orders.length },
    { key: "dividends", label: "Dividendi", count: activity.dividends.length },
    { key: "flows", label: "Versamenti", count: activity.cash_flows.length },
  ];
  const total = tabs.find((t) => t.key === tab)?.count ?? 0;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Attività" className="flex gap-1 border-b">
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
                {o.side === "buy" ? "Acquisto" : "Vendita"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.name ?? o.ticker}</span>
                <span className="text-xs text-muted-foreground">
                  {day(o.executed_at)} · <span data-sensitive>{formatQuantity(o.quantity)}</span>{" "}
                  quote
                  {o.fees_eur && Number(o.fees_eur) > 0 && (
                    <>
                      {" "}
                      · commissione <Money value={o.fees_eur} />
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
                <span className="block">{FLOW_LABELS[f.type] ?? f.type}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {day(f.occurred_at)}
                  {f.transaction_id !== null && (
                    <span className="inline-flex items-center gap-1">
                      · <Link2 aria-hidden className="size-3" /> abbinato al bonifico in banca
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
          <li className="py-6 text-center text-muted-foreground">Niente da mostrare</li>
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
          Mostra altri ({formatCount(total - shown)})
        </button>
      )}
    </div>
  );
}
