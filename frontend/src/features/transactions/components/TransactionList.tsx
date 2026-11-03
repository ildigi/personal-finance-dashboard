import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";

import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { formatDayHeading } from "@/lib/format";
import { todayInRome } from "@/lib/period";
import { cn } from "@/lib/utils";

import { statusLabel } from "../labels";
import { accountLabel, describeClassification, type Lookups } from "../lookups";
import type { Transaction } from "../queries";

function groupByDay(rows: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>();
  for (const row of rows) {
    const list = groups.get(row.booking_date);
    if (list) list.push(row);
    else groups.set(row.booking_date, [row]);
  }
  return [...groups.entries()];
}

function RowIcon({ tx, lookups }: { tx: Transaction; lookups: Lookups }) {
  const category = tx.category_id !== null ? lookups.categoryById.get(tx.category_id) : undefined;
  const transfer = tx.kind === "internal_transfer" || tx.kind === "investment_transfer";
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        tx.amount.startsWith("-")
          ? "bg-muted text-muted-foreground"
          : "bg-positive/10 text-positive",
      )}
    >
      {category ? (
        <CategoryIcon name={category.icon} className="size-[18px]" />
      ) : transfer ? (
        <ArrowLeftRight aria-hidden className="size-[18px]" />
      ) : tx.amount.startsWith("-") ? (
        <ArrowUpRight aria-hidden className="size-[18px]" />
      ) : (
        <ArrowDownLeft aria-hidden className="size-[18px]" />
      )}
    </span>
  );
}

/** Elenco a schede raggruppato per giorno, per gli schermi stretti. */
export function TransactionList({
  rows,
  lookups,
  onOpen,
}: {
  rows: Transaction[];
  lookups: Lookups;
  onOpen: (id: number) => void;
}) {
  const today = todayInRome();
  return (
    <div className="divide-y">
      {groupByDay(rows).map(([day, items]) => (
        <section key={day} aria-label={formatDayHeading(day, today)}>
          <h3 className="bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground first-letter:uppercase">
            {formatDayHeading(day, today)}
          </h3>
          <ul>
            {items.map((tx) => {
              return (
                <li key={tx.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(tx.id);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-accent"
                  >
                    <RowIcon tx={tx} lookups={lookups} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {tx.merchant_name ?? tx.description_clean}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {describeClassification(tx, lookups)} ·{" "}
                        {accountLabel(lookups.accountById.get(tx.account_id))}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Money
                        value={tx.amount}
                        currency={tx.currency}
                        signed
                        tone="auto"
                        className="num block text-sm font-medium"
                      />
                      {tx.status === "pending" && (
                        <span className="text-[11px] text-muted-foreground">
                          {statusLabel("pending")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
