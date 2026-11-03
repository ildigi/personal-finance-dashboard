import { ArrowLeftRight, ChevronRight, Undo2, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { useDismissTransfer } from "@/features/rules/queries";
import { formatDate } from "@/lib/format";

import { sourceLabel } from "../labels";
import { accountLabel, type Lookups } from "../lookups";
import { useTransaction, type TransactionDetail } from "../queries";
import { messageText } from "@/i18n/messages";

function LinkedRow({
  id,
  icon: Icon,
  title,
  lookups,
  onOpen,
}: {
  id: number;
  icon: typeof ArrowLeftRight;
  title: string;
  lookups: Lookups;
  onOpen: (id: number) => void;
}) {
  const { data: other } = useTransaction(id);
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(id);
      }}
      className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{title}</span>
        <span className="block truncate">
          {other
            ? `${formatDate(other.booking_date, "short")} · ${accountLabel(lookups.accountById.get(other.account_id))}`
            : "…"}
        </span>
      </span>
      {other && <Money value={other.amount} signed tone="auto" className="num shrink-0" />}
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Perché ha questa classificazione, e a cosa è collegato (giroconto, rimborso). */
export function TransactionLinks({
  tx,
  lookups,
  onOpen,
}: {
  tx: TransactionDetail;
  lookups: Lookups;
  onOpen: (id: number) => void;
}) {
  const { t } = useTranslation();
  const dismiss = useDismissTransfer();
  const pair = tx.transfer_pair_id;
  // Codice con parametri; le righe classificate prima dei codici hanno ancora la nota in italiano.
  const why = tx.classification_reason
    ? messageText(tx.classification_reason, tx.classification_params)
    : tx.classification_note;
  return (
    <section aria-labelledby="why-heading" className="space-y-3">
      <h3 id="why-heading" className="text-sm font-medium">
        {t("transactions.links.why")}
      </h3>
      <p className="text-sm">
        <span className="font-medium">{sourceLabel(tx.classification_source)}</span>
        {why && why !== sourceLabel(tx.classification_source) && (
          <span className="text-muted-foreground"> · {why}</span>
        )}
      </p>
      {tx.rule_id !== null && (
        <Link
          to={`/regole#regola-${String(tx.rule_id)}`}
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          {t("transactions.links.seeRule")}
        </Link>
      )}

      {pair !== null && (
        <div className="space-y-2">
          <LinkedRow
            id={pair}
            icon={ArrowLeftRight}
            title={t("transactions.links.otherSide")}
            lookups={lookups}
            onOpen={onOpen}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={dismiss.isPending}
            onClick={() => {
              const negative = tx.amount_eur.startsWith("-");
              dismiss.mutate({
                out_id: negative ? tx.id : pair,
                in_id: negative ? pair : tx.id,
              });
            }}
          >
            <Unlink aria-hidden />
            {t("transactions.links.notTransfer")}
          </Button>
        </div>
      )}
      {tx.refund_of_id !== null && (
        <LinkedRow
          id={tx.refund_of_id}
          icon={Undo2}
          title={t("transactions.links.refundOf")}
          lookups={lookups}
          onOpen={onOpen}
        />
      )}
    </section>
  );
}
