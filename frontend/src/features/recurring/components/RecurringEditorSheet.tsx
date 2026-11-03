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

import { FIXED_FREQUENCIES, type Frequency } from "../labels";
import { useUpdateRecurring, type Recurring } from "../queries";
import { currentLanguage, i18n } from "@/i18n";

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
  // Importo nel formato della lingua: "12,50" in italiano, "12.50" in inglese.
  const [amount, setAmount] = useState(
    currentLanguage() === "it" ? item.expected_amount.replace(".", ",") : item.expected_amount,
  );
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
      ? i18n.t("recurring.editor.errors.name")
      : !expected
        ? i18n.t("recurring.editor.errors.amount")
        : frequency === "custom" && !(Number.isInteger(days) && days >= 1 && days <= 730)
          ? i18n.t("recurring.editor.errors.interval")
          : !(Number.isInteger(tol) && tol >= 0 && tol <= 50)
            ? i18n.t("recurring.editor.errors.tolerance")
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
          setError(err instanceof ApiError ? err.message : i18n.t("recurring.editor.errors.save"));
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
      <SheetHeader className="border-b">
        <SheetTitle>
          {item.status === "suggested"
            ? i18n.t("recurring.row.fixAndConfirm")
            : i18n.t("recurring.editor.editTitle")}
        </SheetTitle>
        <SheetDescription>{i18n.t("recurring.editor.description")}</SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 p-4">
        <FormField label={i18n.t("recurring.editor.name")} htmlFor="recurring-name">
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
          <FormField label={i18n.t("recurring.editor.amount")} htmlFor="recurring-amount">
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
            label={i18n.t("recurring.editor.tolerance")}
            htmlFor="recurring-tolerance"
            hint={i18n.t("recurring.editor.toleranceHint")}
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
          <FormField label={i18n.t("recurring.editor.frequency")} htmlFor="recurring-frequency">
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
                {FIXED_FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {i18n.t(`recurring.frequency.${f}`)}
                  </SelectItem>
                ))}
                <SelectItem value="custom">{i18n.t("recurring.frequency.custom")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          {frequency === "custom" && (
            <FormField label={i18n.t("recurring.editor.interval")} htmlFor="recurring-interval">
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
          {i18n.t("common.cancel")}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending
            ? i18n.t("recurring.editor.saving")
            : item.status === "suggested"
              ? i18n.t("recurring.row.confirm")
              : i18n.t("recurring.editor.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}
