import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";

import { api, unwrap } from "@/api/client";
import { Money } from "@/components/common/Money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { transactionDescription, type Lookups } from "@/features/transactions/lookups";
import { useUpdateTransaction } from "@/features/transactions/queries";
import { formatDate } from "@/lib/format";
import type { DateRange } from "@/lib/period";
import { i18n } from "@/i18n";

const NONE = "none";

/** Entrate del periodo con la tipologia correggibile al volo. */
export function IncomeList({ range, lookups }: { range: DateRange; lookups: Lookups }) {
  const update = useUpdateTransaction();
  const { data, isPending } = useQuery({
    queryKey: ["transactions", "income-list", range],
    queryFn: () =>
      unwrap(
        api.GET("/api/transactions", {
          params: {
            query: {
              date_from: range.from,
              date_to: range.to,
              kind: ["income"],
              sort: "date_desc",
              limit: 100,
            },
          },
        }),
      ),
  });

  if (isPending) return <Skeleton className="h-48 w-full" />;
  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Inbox aria-hidden className="size-4" />
        {i18n.t("analytics.incomeList.empty")}
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {items.map((tx) => (
        <li
          key={tx.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_12rem_7rem]"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {tx.merchant_name ?? tx.counterparty_name ?? transactionDescription(tx, lookups)}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {formatDate(tx.booking_date, "short")} · {transactionDescription(tx, lookups)}
            </div>
          </div>
          <Money
            value={tx.amount}
            signed
            tone="auto"
            className="num text-right text-sm font-medium sm:order-last"
          />
          <Select
            value={tx.income_type_id !== null ? String(tx.income_type_id) : NONE}
            onValueChange={(v) => {
              update.mutate({
                id: tx.id,
                body: { income_type_id: v === NONE ? null : Number(v) },
              });
            }}
          >
            <SelectTrigger
              aria-label={i18n.t("analytics.incomeList.typeOf", { name: tx.description_clean })}
              className="col-span-2 h-8 w-full bg-card text-xs sm:col-span-1"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{i18n.t("analytics.incomeList.noType")}</SelectItem>
              {lookups.incomeTypes.map((i) => (
                <SelectItem key={i.id} value={String(i.id)}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  );
}
