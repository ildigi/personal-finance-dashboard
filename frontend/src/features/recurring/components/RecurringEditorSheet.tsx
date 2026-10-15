import { useState, type SyntheticEvent } from "react";

import { ApiError } from "@/api/client";
import { FormField } from "@/components/common/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
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
import { parseAmountInput } from "@/lib/format";

import { FREQUENCY_LABELS, type Frequency } from "../labels";
import { useUpdateRecurring, type Recurring } from "../queries";

/** Correggi nome, importo atteso, frequenza e tolleranza (correggere una proposta la conferma). */
export function RecurringEditorSheet({
  item,
  onClose,
}: {
  item: Recurring | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-card sm:max-w-md">
        {item && <RecurringForm key={item.id} item={item} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function RecurringForm({ item, onClose }: { item: Recurring; onClose: () => void }) {
  const save = useUpdateRecurring();
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(item.expected_amount.replace(".", ","));
  const [frequency, setFrequency] = useState<Frequency>(item.frequency as Frequency);
  const [interval, setInterval] = useState(String(item.interval_days ?? 30));
  const [tolerance, setTolerance] = useState(String(Number(item.amount_tolerance_pct)));
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: SyntheticEvent): void {
    event.preventDefault();
    const expected = parseAmountInput(amount);
    const days = Number(interval);
    const tol = Number(tolerance);
    const problem = !name.trim()
      ? "Dai un nome alla ricorrenza"
      : !expected
        ? "Importo non valido"
        : frequency === "custom" && !(Number.isInteger(days) && days >= 1 && days <= 730)
          ? "Ogni quanti giorni? Da 1 a 730"
          : !(Number.isInteger(tol) && tol >= 0 && tol <= 50)
            ? "Tolleranza da 0 a 50%"
            : null;
    setError(problem);
    if (problem || !expected) return;
    save.mutate(
      {
        id: item.id,
        body: {
          name: name.trim(),
          expected_amount: expected,
          frequency,
          interval_days: frequency === "custom" ? days : null,
          amount_tolerance_pct: tol,
        },
      },
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
        <SheetTitle>
          {item.status === "suggested" ? "Correggi e conferma" : "Modifica ricorrenza"}
        </SheetTitle>
        <SheetDescription>
          Fanno parte della ricorrenza i movimenti della stessa controparte con importo entro la
          tolleranza. Le tue scelte restano anche dopo le prossime sincronizzazioni.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 p-4">
        <FormField label="Nome" htmlFor="recurring-name">
          <Input
            id="recurring-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            maxLength={200}
            className="bg-card"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Importo atteso (€)" htmlFor="recurring-amount">
            <Input
              id="recurring-amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
              inputMode="decimal"
              className="bg-card"
            />
          </FormField>
          <FormField
            label="Tolleranza (%)"
            htmlFor="recurring-tolerance"
            hint="Scarto ammesso sull'importo"
          >
            <Input
              id="recurring-tolerance"
              value={tolerance}
              onChange={(event) => {
                setTolerance(event.target.value);
              }}
              inputMode="numeric"
              className="bg-card"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Frequenza" htmlFor="recurring-frequency">
            <Select
              value={frequency}
              onValueChange={(v) => {
                setFrequency(v as Frequency);
              }}
            >
              <SelectTrigger id="recurring-frequency" className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FREQUENCY_LABELS) as Exclude<Frequency, "custom">[]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Ogni tot giorni</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          {frequency === "custom" && (
            <FormField label="Ogni quanti giorni" htmlFor="recurring-interval">
              <Input
                id="recurring-interval"
                value={interval}
                onChange={(event) => {
                  setInterval(event.target.value);
                }}
                inputMode="numeric"
                className="bg-card"
              />
            </FormField>
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
          {save.isPending ? "Salvataggio…" : item.status === "suggested" ? "Conferma" : "Salva"}
        </Button>
      </SheetFooter>
    </form>
  );
}
