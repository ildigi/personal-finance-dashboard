import { Tag, X } from "lucide-react";
import { useState } from "react";

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

import { KIND_LABELS, type TransactionKind } from "../labels";
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
          setMessage(`${label}: ${formatCount(result.updated)} movimenti aggiornati`);
        },
        onError: (error) => {
          setMessage(error instanceof ApiError ? error.message : "Modifica non riuscita");
        },
      },
    );
  }

  return (
    <div
      role="region"
      aria-label="Azioni sui movimenti selezionati"
      // Fluttua sopra la pagina: comparendo non sposta la tabella.
      className="fixed right-4 bottom-4 left-4 z-30 mx-auto flex max-w-5xl flex-col gap-2 rounded-xl border border-primary/30 bg-card/95 p-2.5 shadow-lg backdrop-blur sm:flex-row sm:items-center lg:left-64"
    >
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <span className="px-1.5 text-sm font-medium">{formatCount(selected.size)} selezionati</span>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8">
          <X aria-hidden />
          Deseleziona
        </Button>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
        <CategoryPicker
          categories={lookups.categories}
          value={{ categoryId: null, subcategoryId: null }}
          allowNone={false}
          label="Imposta la categoria dei selezionati"
          className="h-8"
          onChange={(choice) => {
            apply(
              { category_id: choice.categoryId, subcategory_id: choice.subcategoryId },
              "Categoria",
            );
          }}
        />
        <Select
          value={PLACEHOLDER}
          onValueChange={(v) => {
            apply({ kind: v as TransactionKind }, "Tipo");
          }}
        >
          <SelectTrigger
            aria-label="Imposta il tipo dei selezionati"
            className="h-8 w-full bg-card"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PLACEHOLDER} disabled>
              Cambia tipo…
            </SelectItem>
            {(Object.keys(KIND_LABELS) as TransactionKind[]).map((kind) => (
              <SelectItem key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={PLACEHOLDER}
          onValueChange={(v) => {
            if (v === NEW_TAG) {
              const name = window.prompt("Nome del nuovo tag")?.trim();
              if (!name) return;
              createTag.mutate(name, {
                onSuccess: (tag) => {
                  apply({ add_tag_ids: [tag.id] }, `Tag «${tag.name}»`);
                },
              });
              return;
            }
            const tag = tags.data?.find((t) => String(t.id) === v);
            if (tag) apply({ add_tag_ids: [tag.id] }, `Tag «${tag.name}»`);
          }}
        >
          <SelectTrigger aria-label="Aggiungi un tag ai selezionati" className="h-8 w-full bg-card">
            <Tag aria-hidden className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PLACEHOLDER} disabled>
              Aggiungi tag…
            </SelectItem>
            {(tags.data ?? []).map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
            {(tags.data ?? []).length > 0 && <SelectSeparator />}
            <SelectItem value={NEW_TAG}>Nuovo tag…</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p
        aria-live="polite"
        className="min-h-4 px-1.5 text-xs text-muted-foreground sm:w-48 sm:truncate"
      >
        {bulk.isPending ? "Aggiornamento…" : message}
      </p>
    </div>
  );
}
