import { ArrowLeftRight, ChevronRight, Undo2, Unlink } from "lucide-react";
import { Link } from "react-router";

import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { useDismissTransfer } from "@/features/rules/queries";
import { formatDate } from "@/lib/format";

import { SOURCE_LABELS } from "../labels";
import { accountLabel, type Lookups } from "../lookups";
import { useTransaction, type TransactionDetail } from "../queries";

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
  const dismiss = useDismissTransfer();
  const pair = tx.transfer_pair_id;
  return (
    <section aria-labelledby="why-heading" className="space-y-3">
      <h3 id="why-heading" className="text-sm font-medium">
        Perché
      </h3>
      <p className="text-sm">
        <span className="font-medium">{SOURCE_LABELS[tx.classification_source]}</span>
        {tx.classification_note &&
          tx.classification_note !== SOURCE_LABELS[tx.classification_source] && (
            <span className="text-muted-foreground"> · {tx.classification_note}</span>
          )}
      </p>
      {tx.rule_id !== null && (
        <Link
          to={`/regole#regola-${String(tx.rule_id)}`}
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          Vedi la regola
        </Link>
      )}

      {pair !== null && (
        <div className="space-y-2">
          <LinkedRow
            id={pair}
            icon={ArrowLeftRight}
            title="L'altro lato del trasferimento"
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
            Non è un trasferimento
          </Button>
        </div>
      )}
      {tx.refund_of_id !== null && (
        <LinkedRow
          id={tx.refund_of_id}
          icon={Undo2}
          title="Rimborso di questo acquisto"
          lookups={lookups}
          onOpen={onOpen}
        />
      )}
    </section>
  );
}
