import { Braces, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { Money } from "@/components/common/Money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime, maskIban } from "@/lib/format";

import { KIND_LABELS, STATUS_LABELS } from "../labels";
import { accountLabel, type Lookups } from "../lookups";
import {
  useDeleteTransaction,
  useResetClassification,
  useTransaction,
  useUpdateTransaction,
  type TransactionDetail,
} from "../queries";
import { ClassificationEditor } from "./ClassificationEditor";
import { TransactionLinks } from "./TransactionLinks";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const OVERRIDE_FIELDS: Record<string, string> = {
  kind: "Tipo",
  category_id: "Categoria",
  subcategory_id: "Sottocategoria",
  income_type_id: "Tipologia di entrata",
  merchant_id: "Merchant",
  notes: "Note",
  transfer_pair_id: "Abbinamento del trasferimento",
  refund_of_id: "Collegamento del rimborso",
};

function Corrections({ tx }: { tx: TransactionDetail }) {
  const reset = useResetClassification();
  // Le note non sono una classificazione: restano anche dopo il ripristino.
  const resettable =
    tx.overrides.some((o) => o.field !== "notes") ||
    (tx.is_manual && tx.classification_source === "manual");
  if (tx.overrides.length === 0 && !resettable) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Correzioni manuali</h3>
      <p className="text-xs text-muted-foreground">
        Restano valide anche dopo le prossime sincronizzazioni. Riscegliere il valore di prima
        annulla la correzione.
      </p>
      {tx.overrides.length > 0 && (
        <ul className="space-y-1 text-sm">
          {tx.overrides.map((o) => (
            <li key={o.field} className="flex justify-between gap-3">
              <span>{OVERRIDE_FIELDS[o.field] ?? o.field}</span>
              <span className="text-muted-foreground">{formatDateTime(o.updated_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {resettable && (
        <Button
          variant="outline"
          size="sm"
          disabled={reset.isPending}
          onClick={() => {
            reset.mutate(tx.id);
          }}
        >
          <RotateCcw aria-hidden />
          {reset.isPending ? "Ripristino…" : "Ripristina la classificazione automatica"}
        </Button>
      )}
      {reset.isError && (
        <p role="alert" className="text-xs text-destructive">
          Ripristino non riuscito
        </p>
      )}
    </section>
  );
}

function NotesEditor({ tx }: { tx: TransactionDetail }) {
  const update = useUpdateTransaction();
  const [draft, setDraft] = useState(tx.notes ?? "");
  const changed = draft.trim() !== (tx.notes ?? "");
  return (
    <section className="space-y-2">
      <label htmlFor="tx-notes" className="text-sm font-medium">
        Note
      </label>
      <Textarea
        id="tx-notes"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        rows={2}
        maxLength={2000}
        placeholder="Aggiungi una nota (resta anche dopo le sincronizzazioni)"
        className="bg-card"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={!changed || update.isPending}
          onClick={() => {
            update.mutate({ id: tx.id, body: { notes: draft.trim() || null } });
          }}
        >
          {update.isPending ? "Salvataggio…" : "Salva nota"}
        </Button>
      </div>
    </section>
  );
}

export function TransactionDetailSheet({
  id,
  lookups,
  onClose,
  onOpen,
}: {
  id: number | null;
  lookups: Lookups;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  const { data: tx, isPending } = useTransaction(id);
  const remove = useDeleteTransaction();

  return (
    <Sheet
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-card sm:max-w-md">
        <SheetHeader className="border-b pb-4">
          <SheetDescription>Dettaglio movimento</SheetDescription>
          {isPending || !tx ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          ) : (
            <>
              <SheetTitle className="text-3xl font-semibold tracking-tight">
                <Money value={tx.amount} currency={tx.currency} signed tone="auto" />
              </SheetTitle>
              <p className="text-sm font-medium">{tx.merchant_name ?? tx.description_clean}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="secondary">{KIND_LABELS[tx.kind]}</Badge>
                <Badge variant="outline">{STATUS_LABELS[tx.status]}</Badge>
                {tx.is_manual && <Badge variant="outline">Inserito a mano</Badge>}
              </div>
            </>
          )}
        </SheetHeader>

        {tx && (
          <div key={tx.id} className="space-y-6 p-4">
            <ClassificationEditor tx={tx} lookups={lookups} />
            <TransactionLinks tx={tx} lookups={lookups} onOpen={onOpen} />
            <dl className="divide-y">
              <Row label="Data contabile">{formatDate(tx.booking_date, "long")}</Row>
              {tx.value_date && tx.value_date !== tx.booking_date && (
                <Row label="Data valuta">{formatDate(tx.value_date)}</Row>
              )}
              <Row label="Conto">{accountLabel(lookups.accountById.get(tx.account_id))}</Row>
              {tx.merchant_name && <Row label="Merchant">{tx.merchant_name}</Row>}
              {tx.counterparty_name && <Row label="Controparte">{tx.counterparty_name}</Row>}
              {tx.counterparty_iban && (
                <Row label="IBAN controparte">
                  <span data-sensitive className="num">
                    {maskIban(tx.counterparty_iban)}
                  </span>
                </Row>
              )}
              {tx.original_amount && tx.original_currency && (
                <Row label="Importo originale">
                  <Money value={tx.original_amount} currency={tx.original_currency} />
                  {tx.fx_rate && (
                    <span className="text-muted-foreground"> · cambio {tx.fx_rate}</span>
                  )}
                </Row>
              )}
              <Row label="Descrizione banca">
                <span className="text-muted-foreground">{tx.description_raw}</span>
              </Row>
              {(tx.provider_category ?? tx.mcc) && (
                <Row label="Dati del provider">
                  <span className="text-muted-foreground">
                    {[tx.provider_category, tx.mcc && `MCC ${tx.mcc}`].filter(Boolean).join(" · ")}
                  </span>
                </Row>
              )}
              <Row label="Registrato">{formatDateTime(tx.created_at)}</Row>
            </dl>

            <NotesEditor tx={tx} />

            <Corrections tx={tx} />

            {tx.raw && (
              <details className="group rounded-xl border">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-medium select-none">
                  <Braces aria-hidden className="size-4 text-muted-foreground" />
                  Dato originale del provider
                </summary>
                <pre
                  data-sensitive
                  className="max-h-72 overflow-auto border-t bg-muted/40 p-3 text-xs leading-relaxed"
                >
                  {JSON.stringify(tx.raw, null, 2)}
                </pre>
              </details>
            )}

            {tx.kind !== "internal_transfer" && (
              <Button variant="outline" className="w-full" asChild>
                <Link to={`/regole?da=${String(tx.id)}`}>
                  <Wand2 aria-hidden />
                  Crea una regola da questo movimento
                </Link>
              </Button>
            )}

            {tx.is_manual && (
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("Eliminare questo movimento inserito a mano?")) {
                    remove.mutate(tx.id, { onSuccess: onClose });
                  }
                }}
              >
                <Trash2 aria-hidden />
                Elimina movimento
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
