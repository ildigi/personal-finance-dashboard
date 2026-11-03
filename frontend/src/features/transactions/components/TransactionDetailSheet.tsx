import { Braces, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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

import { kindLabel, statusLabel } from "../labels";
import { accountLabel, transactionDescription, type Lookups } from "../lookups";
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

/** Campi con un nome in `transactions.detail.overrides.fields`; gli altri restano col codice. */
const OVERRIDE_FIELDS = [
  "kind",
  "category_id",
  "subcategory_id",
  "income_type_id",
  "merchant_id",
  "notes",
  "transfer_pair_id",
  "refund_of_id",
] as const;

const isNamedField = (field: string): field is (typeof OVERRIDE_FIELDS)[number] =>
  (OVERRIDE_FIELDS as readonly string[]).includes(field);

function Corrections({ tx }: { tx: TransactionDetail }) {
  const { t } = useTranslation();
  const reset = useResetClassification();
  // Le note non sono una classificazione: restano anche dopo il ripristino.
  const resettable =
    tx.overrides.some((o) => o.field !== "notes") ||
    (tx.is_manual && tx.classification_source === "manual");
  if (tx.overrides.length === 0 && !resettable) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{t("transactions.detail.overrides.title")}</h3>
      <p className="text-xs text-muted-foreground">{t("transactions.detail.overrides.hint")}</p>
      {tx.overrides.length > 0 && (
        <ul className="space-y-1 text-sm">
          {tx.overrides.map((o) => (
            <li key={o.field} className="flex justify-between gap-3">
              <span>
                {isNamedField(o.field)
                  ? t(`transactions.detail.overrides.fields.${o.field}`)
                  : o.field}
              </span>
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
          {reset.isPending
            ? t("transactions.detail.overrides.resetting")
            : t("transactions.detail.overrides.reset")}
        </Button>
      )}
      {reset.isError && (
        <p role="alert" className="text-xs text-destructive">
          {t("transactions.detail.overrides.resetFailed")}
        </p>
      )}
    </section>
  );
}

function NotesEditor({ tx }: { tx: TransactionDetail }) {
  const { t } = useTranslation();
  const update = useUpdateTransaction();
  const [draft, setDraft] = useState(tx.notes ?? "");
  const changed = draft.trim() !== (tx.notes ?? "");
  return (
    <section className="space-y-2">
      <label htmlFor="tx-notes" className="text-sm font-medium">
        {t("transactions.detail.notes.label")}
      </label>
      <Textarea
        id="tx-notes"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        rows={2}
        maxLength={2000}
        placeholder={t("transactions.detail.notes.placeholder")}
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
          {update.isPending
            ? t("transactions.detail.notes.saving")
            : t("transactions.detail.notes.save")}
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
  const { t } = useTranslation();
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
          <SheetDescription>{t("transactions.detail.title")}</SheetDescription>
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
              <p className="text-sm font-medium">
                {tx.merchant_name ?? transactionDescription(tx, lookups)}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="secondary">{kindLabel(tx.kind)}</Badge>
                <Badge variant="outline">{statusLabel(tx.status)}</Badge>
                {tx.is_manual && (
                  <Badge variant="outline">{t("transactions.detail.manualBadge")}</Badge>
                )}
              </div>
            </>
          )}
        </SheetHeader>

        {tx && (
          <div key={tx.id} className="space-y-6 p-4">
            <ClassificationEditor tx={tx} lookups={lookups} />
            <TransactionLinks tx={tx} lookups={lookups} onOpen={onOpen} />
            <dl className="divide-y">
              <Row label={t("transactions.detail.bookingDate")}>
                {formatDate(tx.booking_date, "long")}
              </Row>
              {tx.value_date && tx.value_date !== tx.booking_date && (
                <Row label={t("transactions.detail.valueDate")}>{formatDate(tx.value_date)}</Row>
              )}
              <Row label={t("transactions.account")}>
                {accountLabel(lookups.accountById.get(tx.account_id))}
              </Row>
              {tx.merchant_name && (
                <Row label={t("transactions.source.merchant")}>{tx.merchant_name}</Row>
              )}
              {tx.counterparty_name && (
                <Row label={t("transactions.detail.counterparty")}>{tx.counterparty_name}</Row>
              )}
              {tx.counterparty_iban && (
                <Row label={t("transactions.detail.counterpartyIban")}>
                  <span data-sensitive className="num">
                    {maskIban(tx.counterparty_iban)}
                  </span>
                </Row>
              )}
              {tx.original_amount && tx.original_currency && (
                <Row label={t("transactions.detail.originalAmount")}>
                  <Money value={tx.original_amount} currency={tx.original_currency} />
                  {tx.fx_rate && (
                    <span className="text-muted-foreground">
                      {" · "}
                      {t("transactions.detail.fxRate", { rate: tx.fx_rate })}
                    </span>
                  )}
                </Row>
              )}
              <Row label={t("transactions.detail.bankDescription")}>
                <span className="text-muted-foreground">{tx.description_raw}</span>
              </Row>
              {(tx.provider_category ?? tx.mcc) && (
                <Row label={t("transactions.detail.providerData")}>
                  <span className="text-muted-foreground">
                    {[tx.provider_category, tx.mcc && `MCC ${tx.mcc}`].filter(Boolean).join(" · ")}
                  </span>
                </Row>
              )}
              <Row label={t("transactions.detail.recorded")}>{formatDateTime(tx.created_at)}</Row>
            </dl>

            <NotesEditor tx={tx} />

            <Corrections tx={tx} />

            {tx.raw && (
              <details className="group rounded-xl border">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-medium select-none">
                  <Braces aria-hidden className="size-4 text-muted-foreground" />
                  {t("transactions.detail.raw")}
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
                  {t("transactions.detail.createRule")}
                </Link>
              </Button>
            )}

            {tx.is_manual && (
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t("transactions.detail.deleteConfirm"))) {
                    remove.mutate(tx.id, { onSuccess: onClose });
                  }
                }}
              >
                <Trash2 aria-hidden />
                {t("transactions.detail.delete")}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
