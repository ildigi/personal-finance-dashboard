import { Tag, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCount } from "@/lib/format";

import { TRANSACTION_KINDS, kindLabel, type TransactionKind } from "../labels";
import type { Lookups } from "../lookups";
import { useBulkUpdate, useCreateTag, useTags, type BulkUpdate } from "../queries";
import { CategoryPicker } from "./CategoryPicker";

const PLACEHOLDER = "placeholder";
const NEW_TAG = "new";

/**
 * Azioni sui movimenti selezionati: categoria, tipo, tag. Ogni modifica è una
 * correzione manuale: resta valida anche dopo le prossime sincronizzazioni.
 */
export function BulkActionsBar({
  selected,
  lookups,
  onClear,
}: {
  selected: ReadonlySet<number>;
  lookups: Lookups;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const bulk = useBulkUpdate();
  const tags = useTags();
  const createTag = useCreateTag();
  const [message, setMessage] = useState<string | null>(null);

  function apply(change: Omit<BulkUpdate, "ids">, label: string): void {
    setMessage(null);
    bulk.mutate(
      { ids: [...selected], ...change },
      {
        onSuccess: (result) => {
          setMessage(t("transactions.bulk.updated", { label, n: formatCount(result.updated) }));
        },
        onError: (error) => {
          setMessage(error instanceof ApiError ? error.message : t("transactions.bulk.failed"));
        },
      },
    );
  }

  return (
    <div
      role="region"
      aria-label={t("transactions.bulk.region")}
      // Fluttua sopra la pagina: comparendo non sposta la tabella.
      className="fixed right-4 bottom-4 left-4 z-30 mx-auto flex max-w-5xl flex-col gap-2 rounded-xl border border-primary/30 bg-card/95 p-2.5 shadow-lg backdrop-blur sm:flex-row sm:items-center lg:left-64"
    >
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <span className="px-1.5 text-sm font-medium">
          {t("transactions.bulk.selected", { n: formatCount(selected.size) })}
        </span>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8">
          <X aria-hidden />
          {t("transactions.bulk.deselect")}
        </Button>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
        <CategoryPicker
          categories={lookups.categories}
          value={{ categoryId: null, subcategoryId: null }}
          allowNone={false}
          label={t("transactions.bulk.setCategory")}
          className="h-8"
          onChange={(choice) => {
            apply(
              { category_id: choice.categoryId, subcategory_id: choice.subcategoryId },
              t("transactions.bulk.categoryDone"),
            );
          }}
        />
        <Select
          value={PLACEHOLDER}
          onValueChange={(v) => {
            apply({ kind: v as TransactionKind }, t("transactions.bulk.kindDone"));
          }}
        >
          <SelectTrigger aria-label={t("transactions.bulk.setKind")} className="h-8 w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PLACEHOLDER} disabled>
              {t("transactions.bulk.changeKind")}
            </SelectItem>
            {TRANSACTION_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {kindLabel(kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={PLACEHOLDER}
          onValueChange={(v) => {
            if (v === NEW_TAG) {
              const name = window.prompt(t("transactions.bulk.newTagPrompt"))?.trim();
              if (!name) return;
              createTag.mutate(name, {
                onSuccess: (tag) => {
                  apply(
                    { add_tag_ids: [tag.id] },
                    t("transactions.bulk.tagDone", { name: tag.name }),
                  );
                },
              });
              return;
            }
            const tag = tags.data?.find((t) => String(t.id) === v);
            if (tag)
              apply({ add_tag_ids: [tag.id] }, t("transactions.bulk.tagDone", { name: tag.name }));
          }}
        >
          <SelectTrigger aria-label={t("transactions.bulk.addTag")} className="h-8 w-full bg-card">
            <Tag aria-hidden className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PLACEHOLDER} disabled>
              {t("transactions.bulk.addTagPlaceholder")}
            </SelectItem>
            {(tags.data ?? []).map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
            {(tags.data ?? []).length > 0 && <SelectSeparator />}
            <SelectItem value={NEW_TAG}>{t("transactions.bulk.newTag")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p
        aria-live="polite"
        className="min-h-4 px-1.5 text-xs text-muted-foreground sm:w-48 sm:truncate"
      >
        {bulk.isPending ? t("transactions.bulk.updating") : message}
      </p>
    </div>
  );
}
