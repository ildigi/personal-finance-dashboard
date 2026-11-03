import {
  Check,
  Clock,
  ListFilter,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router";

import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { transactionsUrl } from "@/features/transactions/filters";
import type { Lookups } from "@/features/transactions/lookups";
import { formatCount, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { confidenceLabel, frequencyLabel, perPeriodSuffix } from "../labels";
import type { Recurring } from "../queries";
import { RecurringCategory } from "./RecurringCategory";
import { i18n } from "@/i18n";

export type RecurringAction = "confirm" | "reject" | "end" | "forget" | "edit" | "delete";

/** Una ricorrenza: proposta (conferma/rifiuta), confermata, terminata o rifiutata. */
export function RecurringRow({
  item,
  lookups,
  busy,
  highlighted,
  onAction,
}: {
  item: Recurring;
  lookups: Lookups;
  busy: boolean;
  highlighted?: boolean;
  onAction: (action: RecurringAction) => void;
}) {
  const archived = item.status === "ended" || item.status === "rejected";
  const details = [
    frequencyLabel(item.frequency, item.interval_days),
    item.occurrences > 0
      ? i18n.t("recurring.row.transactions", {
          count: item.occurrences,
          n: formatCount(item.occurrences),
        })
      : null,
    item.status === "suggested" ? confidenceLabel(item.confidence) : null,
  ].filter(Boolean);

  return (
    <li
      id={`ricorrenza-${String(item.id)}`}
      className={cn(
        "flex scroll-mt-24 flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5",
        archived && "opacity-70",
        highlighted && "bg-primary/5 ring-1 ring-primary/40 ring-inset",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{item.name}</span>
          <RecurringCategory
            item={item}
            lookups={lookups}
            className="text-xs text-muted-foreground"
          />
        </div>
        <p className="text-xs text-muted-foreground">{details.join(" · ")}</p>
        <DateLine item={item} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:flex-nowrap sm:justify-end">
        <div className="mr-auto sm:mr-0 sm:text-right">
          <div className="text-sm font-medium tabular-nums">
            <Money
              value={item.direction === "out" ? `-${item.expected_amount}` : item.expected_amount}
              signed
              tone="auto"
            />
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">
              {perPeriodSuffix(item.frequency, item.interval_days)}
            </span>
          </div>
          {item.frequency !== "monthly" && (
            <div className="text-xs text-muted-foreground">
              ≈ <Money value={item.monthly_eur} /> {i18n.t("recurring.row.aboutPerMonth")}
            </div>
          )}
        </div>
        <Actions item={item} busy={busy} onAction={onAction} />
      </div>
    </li>
  );
}

function DateLine({ item }: { item: Recurring }) {
  if (item.status === "rejected") {
    return <p className="text-xs text-muted-foreground">{i18n.t("recurring.row.rejected")}</p>;
  }
  if (item.status === "ended") {
    return (
      <p className="text-xs text-muted-foreground">
        {i18n.t("recurring.row.ended")}
        {item.last_seen_date &&
          i18n.t("recurring.row.lastCharge", { date: formatDate(item.last_seen_date) })}
      </p>
    );
  }
  if (!item.next_expected_date) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      {item.is_late ? (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <Clock aria-hidden className="size-3 text-status-serious" />
          {i18n.t("recurring.row.expectedLate", { date: formatDate(item.next_expected_date) })}
        </span>
      ) : (
        <span>{i18n.t("recurring.row.next", { date: formatDate(item.next_expected_date) })}</span>
      )}
      {item.last_seen_date && (
        <span>{i18n.t("recurring.row.last", { date: formatDate(item.last_seen_date) })}</span>
      )}
    </p>
  );
}

function Actions({
  item,
  busy,
  onAction,
}: {
  item: Recurring;
  busy: boolean;
  onAction: (action: RecurringAction) => void;
}) {
  if (item.status === "suggested") {
    return (
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            onAction("reject");
          }}
          aria-label={i18n.t("recurring.row.reject", { name: item.name })}
        >
          <X aria-hidden />{" "}
          <span className="hidden sm:inline">{i18n.t("recurring.row.notRecurring")}</span>
          <span className="sm:hidden">{i18n.t("recurring.row.rejectShort")}</span>
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            onAction("confirm");
          }}
          aria-label={i18n.t("recurring.row.confirmNamed", { name: item.name })}
        >
          <Check aria-hidden /> {i18n.t("recurring.row.confirm")}
        </Button>
        <Menu item={item} busy={busy} onAction={onAction} />
      </div>
    );
  }
  return <Menu item={item} busy={busy} onAction={onAction} />;
}

function Menu({
  item,
  busy,
  onAction,
}: {
  item: Recurring;
  busy: boolean;
  onAction: (action: RecurringAction) => void;
}) {
  // "Elimina" apre un dialogo: si apre a menu chiuso, altrimenti il menu si riprende il focus.
  const afterClose = useRef<RecurringAction | null>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={i18n.t("recurring.row.moreActions", { name: item.name })}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(event) => {
          const action = afterClose.current;
          if (action) {
            event.preventDefault();
            afterClose.current = null;
            onAction(action);
          }
        }}
      >
        {item.status !== "rejected" && (
          <DropdownMenuItem
            onSelect={() => {
              onAction("edit");
            }}
          >
            <Pencil aria-hidden />{" "}
            {item.status === "suggested"
              ? i18n.t("recurring.row.fixAndConfirm")
              : i18n.t("recurring.row.edit")}
          </DropdownMenuItem>
        )}
        {item.occurrences > 0 && (
          <DropdownMenuItem asChild>
            <Link to={transactionsUrl({ recurring: item.id })}>
              <ListFilter aria-hidden /> {i18n.t("recurring.row.seeTransactions")}
            </Link>
          </DropdownMenuItem>
        )}
        {item.status === "confirmed" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onAction("end");
              }}
            >
              <Square aria-hidden /> {i18n.t("recurring.row.markEnded")}
            </DropdownMenuItem>
          </>
        )}
        {item.status === "ended" && (
          <DropdownMenuItem
            onSelect={() => {
              onAction("confirm");
            }}
          >
            <RotateCcw aria-hidden /> {i18n.t("recurring.row.resume")}
          </DropdownMenuItem>
        )}
        {item.status === "rejected" && (
          <DropdownMenuItem
            onSelect={() => {
              onAction("forget");
            }}
          >
            <RotateCcw aria-hidden /> {i18n.t("recurring.row.undoReject")}
          </DropdownMenuItem>
        )}
        {item.status !== "suggested" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                afterClose.current = "delete";
              }}
            >
              <Trash2 aria-hidden /> {i18n.t("common.deleteEllipsis")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
