import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/api/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { TRANSACTION_KINDS, kindLabel, type TransactionKind } from "../labels";
import type { Lookups } from "../lookups";
import { useUpdateTransaction, type TransactionDetail, type TransactionUpdate } from "../queries";
import { CategoryPicker } from "./CategoryPicker";
import { LearnPrompt } from "./LearnPrompt";

const NONE = "none";

/**
 * Correzione di tipo, categoria e tipologia di entrata. Ogni modifica è salvata subito
 * come correzione manuale; poi si propone di applicarla ai movimenti simili.
 */
export function ClassificationEditor({ tx, lookups }: { tx: TransactionDetail; lookups: Lookups }) {
  const { t } = useTranslation();
  const update = useUpdateTransaction();
  const [corrected, setCorrected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isIncome = tx.kind === "income";
  const hasCategory = !isIncome && tx.kind !== "internal_transfer";

  function save(body: TransactionUpdate): void {
    setError(null);
    update.mutate(
      { id: tx.id, body },
      {
        onSuccess: () => {
          setCorrected(true);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : t("transactions.editor.failed"));
        },
      },
    );
  }

  return (
    <section aria-labelledby="classification-heading" className="space-y-3">
      <h3 id="classification-heading" className="text-sm font-medium">
        {t("transactions.editor.title")}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tx-kind" className="text-xs text-muted-foreground">
            {t("transactions.filters.kind")}
          </Label>
          <Select
            value={tx.kind}
            onValueChange={(v) => {
              save({ kind: v as TransactionKind });
            }}
            disabled={update.isPending}
          >
            <SelectTrigger id="tx-kind" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSACTION_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {kindLabel(kind)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasCategory && (
          <div className="space-y-1.5">
            <Label htmlFor="tx-category" className="text-xs text-muted-foreground">
              {t("transactions.filters.category")}
            </Label>
            <CategoryPicker
              id="tx-category"
              categories={lookups.categories}
              value={{ categoryId: tx.category_id, subcategoryId: tx.subcategory_id }}
              noneLabel={t("transactions.unclassified")}
              onChange={(choice) => {
                save({ category_id: choice.categoryId, subcategory_id: choice.subcategoryId });
              }}
            />
          </div>
        )}

        {isIncome && (
          <div className="space-y-1.5">
            <Label htmlFor="tx-income" className="text-xs text-muted-foreground">
              {t("transactions.editor.incomeType")}
            </Label>
            <Select
              value={tx.income_type_id !== null ? String(tx.income_type_id) : NONE}
              onValueChange={(v) => {
                save({ income_type_id: v === NONE ? null : Number(v) });
              }}
              disabled={update.isPending}
            >
              <SelectTrigger id="tx-income" className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("transactions.editor.none")}</SelectItem>
                <SelectSeparator />
                {lookups.incomeTypes.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <p aria-live="polite" className="text-xs text-destructive empty:hidden">
        {error}
      </p>

      {corrected && <LearnPrompt transactionId={tx.id} />}
    </section>
  );
}
