import { Eye, Search, X } from "lucide-react";
import { useState, type SyntheticEvent } from "react";

import { ApiError } from "@/api/client";
import { FormField as Field } from "@/components/common/FormField";
import { Money } from "@/components/common/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMerchants } from "@/features/merchants/queries";
import { CategoryPicker } from "@/features/transactions/components/CategoryPicker";
import { TRANSACTION_KINDS, kindLabel, type TransactionKind } from "@/features/transactions/labels";
import {
  accountLabel,
  describeClassification,
  type Lookups,
} from "@/features/transactions/lookups";
import { formatCount, formatDate, parseAmountInput } from "@/lib/format";

import {
  usePreviewRule,
  useSaveRule,
  type RuleActions,
  type RuleConditions,
  type RuleCreate,
  type RulePreview,
} from "../queries";

const ANY = "any";
const KEEP = "keep";

export interface RuleDraft {
  id: number | null;
  name: string;
  conditions: RuleConditions;
  actions: RuleActions;
  /** Nome del merchant della condizione, se c'è (per mostrarlo senza cercarlo). */
  merchantName?: string;
}

function amountText(value: string | null | undefined): string {
  return value ? value.replace(".", ",") : "";
}

function MerchantField({
  value,
  name,
  onChange,
}: {
  value: number | null;
  name: string | undefined;
  onChange: (id: number | null, name?: string) => void;
}) {
  const [q, setQ] = useState("");
  const results = useMerchants(q.trim(), { limit: 8, usedOnly: false });
  if (value !== null) {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border bg-card px-3 text-sm">
        <span className="truncate">{name ?? `Merchant #${String(value)}`}</span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
          }}
          aria-label="Togli il merchant"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="rule-merchant"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
          }}
          placeholder="Cerca un merchant (facoltativo)"
          className="bg-card pl-9"
        />
      </div>
      {q.trim().length >= 2 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border bg-popover text-sm">
          {(results.data?.items ?? []).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(m.id, m.name);
                  setQ("");
                }}
                className="flex w-full justify-between px-3 py-1.5 text-left hover:bg-accent"
              >
                <span className="truncate">{m.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatCount(m.transaction_count)} mov.
                </span>
              </button>
            </li>
          ))}
          {results.data?.items.length === 0 && (
            <li className="px-3 py-1.5 text-muted-foreground">Nessun merchant</li>
          )}
        </ul>
      )}
    </div>
  );
}

function PreviewResult({ preview, lookups }: { preview: RulePreview; lookups: Lookups }) {
  return (
    <section aria-live="polite" className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="text-sm">
        Corrisponde a <strong className="font-medium">{formatCount(preview.matched)}</strong>{" "}
        movimenti: <strong className="font-medium">{formatCount(preview.changed)}</strong>{" "}
        cambierebbero
        {preview.blocked > 0 && (
          <>
            , {formatCount(preview.blocked)} restano come sono (correzione manuale, trasferimento o
            regola con priorità più alta)
          </>
        )}
        .
      </p>
      {preview.changes.length > 0 && (
        <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border bg-card text-xs">
          {preview.changes.map((c) => (
            <li key={c.transaction_id} className="space-y-0.5 px-3 py-2">
              <div className="flex justify-between gap-3">
                <span className="truncate font-medium">{c.description}</span>
                <Money value={c.amount_eur} signed tone="auto" className="num shrink-0" />
              </div>
              <div className="text-muted-foreground">
                {formatDate(c.booking_date, "short")} ·{" "}
                {describeClassification(
                  {
                    kind: c.before_kind,
                    category_id: c.before_category_id,
                    subcategory_id: c.before_subcategory_id,
                    income_type_id: null,
                  },
                  lookups,
                )}{" "}
                →{" "}
                <span className="text-foreground">
                  {describeClassification(
                    {
                      kind: c.after_kind,
                      category_id: c.after_category_id,
                      subcategory_id: c.after_subcategory_id,
                      income_type_id: null,
                    },
                    lookups,
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Crea o modifica una regola (condizioni in AND → azioni), con l'anteprima sui
 * movimenti esistenti prima di salvare.
 */
export function RuleEditorSheet({
  draft,
  lookups,
  onClose,
}: {
  draft: RuleDraft | null;
  lookups: Lookups;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-card sm:max-w-lg">
        {draft && (
          <RuleForm key={draft.id ?? "new"} draft={draft} lookups={lookups} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function RuleForm({
  draft,
  lookups,
  onClose,
}: {
  draft: RuleDraft;
  lookups: Lookups;
  onClose: () => void;
}) {
  const c = draft.conditions;
  const a = draft.actions;
  const save = useSaveRule();
  const preview = usePreviewRule();

  const [name, setName] = useState(draft.name);
  const [contains, setContains] = useState(c.description_contains ?? "");
  const [regex, setRegex] = useState(c.description_regex ?? "");
  const [merchant, setMerchant] = useState<{ id: number | null; name?: string }>({
    id: c.merchant_id ?? null,
    name: draft.merchantName,
  });
  const [accountId, setAccountId] = useState(c.account_id != null ? String(c.account_id) : ANY);
  const [direction, setDirection] = useState<string>(c.direction ?? ANY);
  const [amountMin, setAmountMin] = useState(amountText(c.amount_min));
  const [amountMax, setAmountMax] = useState(amountText(c.amount_max));
  const [amounts, setAmounts] = useState((c.amounts ?? []).map(amountText).join("; "));
  const [mcc, setMcc] = useState(c.mcc ?? "");
  const [kind, setKind] = useState<string>(a.kind ?? KEEP);
  const [category, setCategory] = useState({
    categoryId: a.category_id ?? null,
    subcategoryId: a.subcategory_id ?? null,
  });
  const [incomeType, setIncomeType] = useState(
    a.income_type_id != null ? String(a.income_type_id) : KEEP,
  );
  const [error, setError] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState<string | null>(null);

  function build(): RuleCreate | string {
    const conditions: RuleConditions = {};
    if (contains.trim()) conditions.description_contains = contains.trim();
    if (regex.trim()) conditions.description_regex = regex.trim();
    if (merchant.id !== null) conditions.merchant_id = merchant.id;
    if (accountId !== ANY) conditions.account_id = Number(accountId);
    if (direction !== ANY) conditions.direction = direction as "in" | "out";
    if (amountMin.trim()) {
      const v = parseAmountInput(amountMin);
      if (!v) return "Importo minimo non valido";
      conditions.amount_min = v;
    }
    if (amountMax.trim()) {
      const v = parseAmountInput(amountMax);
      if (!v) return "Importo massimo non valido";
      conditions.amount_max = v;
    }
    if (amounts.trim()) {
      const list = amounts
        .split(";")
        .map((x) => parseAmountInput(x))
        .filter((x) => x !== null);
      if (list.length === 0) return "Importi esatti non validi (separali con ;)";
      conditions.amounts = list;
    }
    if (mcc.trim()) conditions.mcc = mcc.trim();
    if (Object.keys(conditions).length === 0) return "Aggiungi almeno una condizione";

    const actions: RuleActions = {};
    if (kind !== KEEP) actions.kind = kind as TransactionKind;
    if (category.categoryId !== null) {
      actions.category_id = category.categoryId;
      actions.subcategory_id = category.subcategoryId;
    }
    if (incomeType !== KEEP) actions.income_type_id = Number(incomeType);
    if (Object.keys(actions).length === 0) return "Scegli almeno un'azione";
    if (!name.trim()) return "Dai un nome alla regola";
    return { name: name.trim(), conditions, actions, priority: 100, is_active: true };
  }

  const built = build();
  const signature = typeof built === "string" ? null : JSON.stringify(built);
  const previewIsCurrent = preview.data !== undefined && previewed === signature;

  function onPreview(): void {
    if (typeof built === "string") {
      setError(built);
      return;
    }
    setError(null);
    preview.mutate(
      { rule_id: draft.id, name: built.name, conditions: built.conditions, actions: built.actions },
      {
        onSuccess: () => {
          setPreviewed(signature);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : "Anteprima non riuscita");
        },
      },
    );
  }

  function onSubmit(event: SyntheticEvent): void {
    event.preventDefault();
    if (typeof built === "string") {
      setError(built);
      return;
    }
    setError(null);
    // In modifica la priorità resta quella attuale (l'ordine si cambia dall'elenco).
    const body: RuleCreate =
      draft.id === null
        ? built
        : { name: built.name, conditions: built.conditions, actions: built.actions };
    save.mutate(
      { id: draft.id, body },
      {
        onSuccess: onClose,
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : "Salvataggio non riuscito");
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
      <SheetHeader className="border-b">
        <SheetTitle>{draft.id === null ? "Nuova regola" : "Modifica regola"}</SheetTitle>
        <SheetDescription>
          Se un movimento soddisfa tutte le condizioni, riceve le azioni. Le tue regole vengono
          prima di quelle di sistema; le correzioni manuali vincono sempre.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 p-4">
        <Field label="Nome" htmlFor="rule-name">
          <Input
            id="rule-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            maxLength={200}
            placeholder="Es. Netflix → Abbonamenti"
            className="bg-card"
          />
        </Field>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">Se il movimento…</legend>
          <Field
            label="Descrizione contiene"
            htmlFor="rule-contains"
            hint="Maiuscole e minuscole non contano"
          >
            <Input
              id="rule-contains"
              value={contains}
              onChange={(event) => {
                setContains(event.target.value);
              }}
              placeholder="Es. netflix"
              className="bg-card"
            />
          </Field>
          <Field label="Merchant" htmlFor="rule-merchant">
            <MerchantField
              value={merchant.id}
              name={merchant.name}
              onChange={(id, merchantName) => {
                setMerchant({ id, name: merchantName });
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Verso" htmlFor="rule-direction">
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger id="rule-direction" className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Uscite ed entrate</SelectItem>
                  <SelectItem value="out">Solo uscite</SelectItem>
                  <SelectItem value="in">Solo entrate</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Conto" htmlFor="rule-account">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="rule-account" className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Tutti i conti</SelectItem>
                  <SelectSeparator />
                  {lookups.accounts
                    .filter((acc) => acc.type !== "broker")
                    .map((acc) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {accountLabel(acc)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Importo da (€)" htmlFor="rule-min">
              <Input
                id="rule-min"
                inputMode="decimal"
                value={amountMin}
                onChange={(event) => {
                  setAmountMin(event.target.value);
                }}
                placeholder="0,00"
                className="bg-card"
              />
            </Field>
            <Field label="Importo fino a (€)" htmlFor="rule-max">
              <Input
                id="rule-max"
                inputMode="decimal"
                value={amountMax}
                onChange={(event) => {
                  setAmountMax(event.target.value);
                }}
                placeholder="—"
                className="bg-card"
              />
            </Field>
          </div>
          <details className="group space-y-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
              Condizioni avanzate
            </summary>
            <div className="mt-3 space-y-3">
              <Field
                label="Importi esatti (€)"
                htmlFor="rule-amounts"
                hint="Separati da ; — es. 0,99; 2,99; 9,99"
              >
                <Input
                  id="rule-amounts"
                  value={amounts}
                  onChange={(event) => {
                    setAmounts(event.target.value);
                  }}
                  className="bg-card"
                />
              </Field>
              <Field label="Espressione regolare sulla descrizione" htmlFor="rule-regex">
                <Input
                  id="rule-regex"
                  value={regex}
                  onChange={(event) => {
                    setRegex(event.target.value);
                  }}
                  placeholder="Es. trading ?212"
                  className="bg-card font-mono text-xs"
                />
              </Field>
              <Field label="Codice MCC" htmlFor="rule-mcc">
                <Input
                  id="rule-mcc"
                  value={mcc}
                  onChange={(event) => {
                    setMcc(event.target.value);
                  }}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Es. 5411"
                  className="bg-card"
                />
              </Field>
            </div>
          </details>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">…allora</legend>
          <Field label="Categoria" htmlFor="rule-category">
            <CategoryPicker
              id="rule-category"
              categories={lookups.categories}
              value={category}
              noneLabel="Non cambiare la categoria"
              onChange={setCategory}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo" htmlFor="rule-kind">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="rule-kind" className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Non cambiare</SelectItem>
                  <SelectSeparator />
                  {TRANSACTION_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {kindLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipologia di entrata" htmlFor="rule-income">
              <Select value={incomeType} onValueChange={setIncomeType}>
                <SelectTrigger id="rule-income" className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Non cambiare</SelectItem>
                  <SelectSeparator />
                  {lookups.incomeTypes.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </fieldset>

        <div className="space-y-3">
          <Button type="button" variant="outline" onClick={onPreview} disabled={preview.isPending}>
            <Eye aria-hidden />
            {preview.isPending ? "Calcolo…" : "Prova sui movimenti esistenti"}
          </Button>
          {preview.data && (
            <div className={previewIsCurrent ? undefined : "opacity-50"}>
              {!previewIsCurrent && (
                <p className="mb-2 text-xs text-muted-foreground">
                  La regola è cambiata dopo l'anteprima: riprovala.
                </p>
              )}
              <PreviewResult preview={preview.data} lookups={lookups} />
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <SheetFooter className="mt-auto flex-row justify-end gap-2 border-t">
        <Button type="button" variant="ghost" onClick={onClose}>
          Annulla
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Salvataggio…" : draft.id === null ? "Crea regola" : "Salva"}
        </Button>
      </SheetFooter>
    </form>
  );
}
