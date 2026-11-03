import { CalendarClock, CheckCheck, Repeat, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { StatTile } from "@/components/common/StatTile";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RecurringEditorSheet } from "@/features/recurring/components/RecurringEditorSheet";
import { RecurringRow, type RecurringAction } from "@/features/recurring/components/RecurringRow";
import { UpcomingList } from "@/features/recurring/components/UpcomingList";
import {
  useForgetRecurring,
  useRecurring,
  useUpcoming,
  useUpdateRecurring,
  type Recurring,
} from "@/features/recurring/queries";
import { useLookups } from "@/features/transactions/lookups";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatCount } from "@/lib/format";
import { i18n } from "@/i18n";

export function RecurringPage() {
  const lookups = useLookups();
  const recurring = useRecurring();
  const upcoming = useUpcoming({ days: 30 });
  const update = useUpdateRecurring();
  const forget = useForgetRecurring();
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [deleting, setDeleting] = useState<Recurring | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const highlighted = useHighlightedId(recurring.data !== undefined);
  const wide = useMediaQuery("(min-width: 640px)");

  if (recurring.isError) {
    return (
      <Card>
        <EmptyState icon={Repeat} title={i18n.t("recurring.unavailable")}>
          {i18n.t("analytics.backendDown")}
        </EmptyState>
      </Card>
    );
  }

  const data = recurring.data;
  const items = data?.items ?? [];
  const suggested = items.filter((i) => i.status === "suggested");
  const confirmed = items.filter((i) => i.status === "confirmed");
  const outgoing = confirmed.filter((i) => i.direction === "out");
  const incoming = confirmed.filter((i) => i.direction === "in");
  const archived = items.filter((i) => i.status === "ended" || i.status === "rejected");
  const summary = data?.summary;

  function act(item: Recurring, action: RecurringAction): void {
    if (action === "edit") {
      setEditing(item);
      return;
    }
    if (action === "delete") {
      setDeleting(item);
      setDeleteOpen(true);
      return;
    }
    setBusyId(item.id);
    const done = { onSettled: () => setBusyId(null) };
    if (action === "forget") {
      forget.mutate(item.id, done);
      return;
    }
    const status = { confirm: "confirmed", reject: "rejected", end: "ended" } as const;
    update.mutate({ id: item.id, body: { status: status[action] } }, done);
  }

  async function confirmAll(): Promise<void> {
    setConfirmingAll(true);
    try {
      for (const item of suggested) {
        await update.mutateAsync({ id: item.id, body: { status: "confirmed" } });
      }
    } finally {
      setConfirmingAll(false);
    }
  }

  const row = (item: Recurring) => (
    <RecurringRow
      key={item.id}
      item={item}
      lookups={lookups}
      busy={busyId === item.id || confirmingAll}
      highlighted={highlighted === item.id}
      onAction={(action) => {
        act(item, action);
      }}
    />
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <p className="text-sm text-muted-foreground">{i18n.t("recurring.intro")}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label={i18n.t("recurring.tiles.expenses")}
          icon={Wallet}
          value={summary ? <Money value={summary.expenses_monthly_eur} /> : undefined}
          delta={i18n.t("recurring.tiles.expensesNote")}
          pendingNote={i18n.t("analytics.loading")}
        />
        <StatTile
          label={i18n.t("recurring.tiles.subscriptions")}
          icon={Repeat}
          value={summary ? <Money value={summary.subscriptions_monthly_eur} /> : undefined}
          delta={i18n.t("recurring.tiles.subscriptionsNote")}
          pendingNote={i18n.t("analytics.loading")}
        />
        <StatTile
          label={i18n.t("recurring.tiles.income")}
          icon={TrendingUp}
          value={summary ? <Money value={summary.income_monthly_eur} /> : undefined}
          delta={i18n.t("recurring.tiles.incomeNote")}
          pendingNote={i18n.t("analytics.loading")}
        />
        <StatTile
          label={i18n.t("recurring.tiles.toConfirm")}
          icon={Sparkles}
          value={summary ? formatCount(summary.suggested_count) : undefined}
          delta={
            summary && summary.late_count > 0
              ? i18n.t("recurring.tiles.late", { n: formatCount(summary.late_count) })
              : i18n.t("recurring.tiles.found")
          }
          pendingNote={i18n.t("analytics.loading")}
        />
      </div>

      {!data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {suggested.length > 0 && (
            <Card className="gap-0 overflow-hidden pb-0">
              <CardHeader className="border-b pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles aria-hidden className="size-4 text-primary" />
                  {i18n.t("recurring.suggested.title")}
                </CardTitle>
                <CardDescription>{i18n.t("recurring.suggested.description")}</CardDescription>
                {suggested.length > 1 &&
                  // Su telefono il pulsante va sotto il testo, non accanto.
                  (wide ? (
                    <CardAction>
                      <ConfirmAllButton busy={confirmingAll} onClick={() => void confirmAll()} />
                    </CardAction>
                  ) : (
                    <div className="mt-2">
                      <ConfirmAllButton busy={confirmingAll} onClick={() => void confirmAll()} />
                    </div>
                  ))}
              </CardHeader>
              <ul className="divide-y">{suggested.map(row)}</ul>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
            <div className="space-y-4 lg:col-span-2 lg:space-y-6">
              <ConfirmedCard
                title={i18n.t("recurring.outgoing.title")}
                description={i18n.t("recurring.outgoing.description")}
                items={outgoing}
                emptyText={
                  suggested.length > 0
                    ? i18n.t("recurring.outgoing.emptyWithSuggestions")
                    : i18n.t("recurring.outgoing.empty")
                }
                row={row}
              />
              {incoming.length > 0 && (
                <ConfirmedCard
                  title={i18n.t("recurring.incoming.title")}
                  description={i18n.t("recurring.incoming.description")}
                  items={incoming}
                  emptyText=""
                  row={row}
                />
              )}
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
                  {i18n.t("recurring.next30.title")}
                </CardTitle>
                <CardDescription>{i18n.t("recurring.next30.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                {upcoming.data ? (
                  <UpcomingList
                    items={upcoming.data}
                    lookups={lookups}
                    emptyText={
                      confirmed.length === 0
                        ? i18n.t("recurring.next30.emptyNoConfirmed")
                        : i18n.t("recurring.next30.empty")
                    }
                  />
                ) : (
                  <Skeleton className="h-48 w-full" />
                )}
              </CardContent>
            </Card>
          </div>

          {archived.length > 0 && (
            <details className="group rounded-xl border bg-card">
              <summary className="cursor-pointer px-5 py-4 text-sm font-medium select-none hover:bg-accent/40">
                {i18n.t("recurring.archived", { n: formatCount(archived.length) })}
              </summary>
              <ul className="divide-y border-t">{archived.map(row)}</ul>
            </details>
          )}

          {items.length === 0 && (
            <Card>
              <EmptyState icon={Repeat} title={i18n.t("recurring.noneTitle")}>
                {i18n.t("recurring.none")}
              </EmptyState>
            </Card>
          )}
        </>
      )}

      <RecurringEditorSheet
        item={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        {/* Resta l'ultima ricorrenza anche mentre il dialogo si chiude (niente testo che sparisce). */}
        {deleting && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {i18n.t("recurring.delete.title", { name: deleting.name })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleting.occurrences === 0
                  ? i18n.t("recurring.delete.noTransactions")
                  : i18n.t("recurring.delete.withTransactions", {
                      n: formatCount(deleting.occurrences),
                    })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{i18n.t("common.cancel")}</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={() => {
                  const item = deleting;
                  setDeleteOpen(false);
                  setBusyId(item.id);
                  forget.mutate(item.id, { onSettled: () => setBusyId(null) });
                }}
              >
                {i18n.t("common.delete")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}

function ConfirmAllButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={onClick}>
      <CheckCheck aria-hidden />
      {busy ? i18n.t("recurring.suggested.confirming") : i18n.t("recurring.suggested.confirmAll")}
    </Button>
  );
}

function ConfirmedCard({
  title,
  description,
  items,
  emptyText,
  row,
}: {
  title: string;
  description: string;
  items: Recurring[];
  emptyText: string;
  row: (item: Recurring) => ReactNode;
}) {
  const monthly = items.reduce((sum, i) => sum + Number(i.monthly_eur), 0);
  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="border-b pb-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {items.length > 0 && (
          <CardAction className="text-right text-sm">
            <Money value={monthly} />
            <div className="text-xs text-muted-foreground">{i18n.t("recurring.perMonth")}</div>
          </CardAction>
        )}
      </CardHeader>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y">{items.map(row)}</ul>
      )}
    </Card>
  );
}

/** `#ricorrenza-12` nell'indirizzo: evidenzia la riga e ci scorre (link dai prossimi addebiti). */
function useHighlightedId(ready: boolean): number | null {
  const { hash } = useLocation();
  const match = /^#ricorrenza-(\d+)$/.exec(hash);
  const id = match ? Number(match[1]) : null;
  useEffect(() => {
    if (id === null || !ready) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`ricorrenza-${String(id)}`)?.scrollIntoView({ block: "center" });
    }, 150);
    return () => {
      window.clearTimeout(timer);
    };
  }, [id, ready]);
  return id;
}
