import { useMemo, useState, type SyntheticEvent } from "react";

import { ApiError } from "@/api/client";
import { FormField } from "@/components/common/FormField";
import { Money } from "@/components/common/Money";
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
import {
  CategoryPicker,
  type CategoryChoice,
} from "@/features/transactions/components/CategoryPicker";
import type { Lookups } from "@/features/transactions/lookups";
import { parseAmountInput } from "@/lib/format";

import {
  useBudgetSuggestion,
  useCreateBudget,
  useUpdateBudget,
  type BudgetStatus,
} from "../queries";
import { currentLanguage, i18n } from "@/i18n";

const THRESHOLDS = [50, 60, 70, 80, 90, 100];

/** `budget` null = nuovo budget; altrimenti modifica di importo e soglia. */
export interface BudgetDraft {
  budget: BudgetStatus | null;
}

export function BudgetEditorSheet({
  draft,
  lookups,
  onClose,
}: {
  draft: BudgetDraft | null;
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
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-card sm:max-w-md">
        {draft && (
          <BudgetForm
            key={draft.budget?.id ?? "new"}
            budget={draft.budget}
            lookups={lookups}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function BudgetForm({
  budget,
  lookups,
  onClose,
}: {
  budget: BudgetStatus | null;
  lookups: Lookups;
  onClose: () => void;
}) {
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const [choice, setChoice] = useState<CategoryChoice>({
    categoryId: budget?.category_id ?? null,
    subcategoryId: budget?.subcategory_id ?? null,
  });
  // Importo nel formato della lingua: "12,50" in italiano, "12.50" in inglese.
  const [amount, setAmount] = useState(
    budget ? (currentLanguage() === "it" ? budget.amount.replace(".", ",") : budget.amount) : "",
  );
  const [threshold, setThreshold] = useState(String(budget?.alert_threshold_pct ?? 80));
  const [error, setError] = useState<string | null>(null);
  const suggestion = useBudgetSuggestion(choice.categoryId, choice.subcategoryId);
  // Solo le categorie di spesa (niente Investimenti, entrate, trasferimenti).
  const categories = useMemo(
    () => lookups.categories.filter((c) => c.kind === "expense" && !c.excluded_from_spending),
    [lookups.categories],
  );
  const pending = create.isPending || update.isPending;

  function onSubmit(event: SyntheticEvent): void {
    event.preventDefault();
    const value = parseAmountInput(amount);
    if (choice.categoryId === null) {
      setError(i18n.t("budgets.editor.chooseCategory"));
      return;
    }
    if (!value) {
      setError(i18n.t("budgets.editor.invalidAmount"));
      return;
    }
    setError(null);
    const callbacks = {
      onSuccess: onClose,
      onError: (err: Error) => {
        setError(err instanceof ApiError ? err.message : i18n.t("budgets.editor.saveFailed"));
      },
    };
    if (budget) {
      update.mutate(
        { id: budget.id, body: { amount: value, alert_threshold_pct: Number(threshold) } },
        callbacks,
      );
    } else {
      create.mutate(
        {
          category_id: choice.categoryId,
          subcategory_id: choice.subcategoryId,
          amount: value,
          alert_threshold_pct: Number(threshold),
        },
        callbacks,
      );
    }
  }

  const hints = suggestion.data
    ? (
        [
          { label: i18n.t("budgets.editor.average3"), value: suggestion.data.average_3m },
          { label: i18n.t("budgets.editor.average6"), value: suggestion.data.average_6m },
          { label: i18n.t("budgets.editor.lastMonth"), value: suggestion.data.last_month },
        ] as { label: string; value: string | null }[]
      ).filter(
        (h): h is { label: string; value: string } => h.value !== null && Number(h.value) > 0,
      )
    : [];

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
      <SheetHeader className="border-b">
        <SheetTitle>
          {budget
            ? i18n.t("budgets.editor.editTitle", { name: budget.name })
            : i18n.t("budgets.editor.newTitle")}
        </SheetTitle>
        <SheetDescription>
          {budget
            ? i18n.t("budgets.editor.editDescription")
            : i18n.t("budgets.editor.newDescription")}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 p-4">
        {!budget && (
          <FormField
            label={i18n.t("budgets.editor.category")}
            htmlFor="budget-category"
            hint={i18n.t("budgets.editor.categoryHint")}
          >
            <CategoryPicker
              id="budget-category"
              categories={categories}
              value={choice}
              allowNone={false}
              onChange={setChoice}
            />
          </FormField>
        )}

        <FormField label={i18n.t("budgets.editor.amount")} htmlFor="budget-amount">
          <Input
            id="budget-amount"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
            inputMode="decimal"
            placeholder={i18n.t("budgets.editor.amountPlaceholder")}
            className="bg-card"
          />
        </FormField>

        {hints.length > 0 && (
          <div className="space-y-2 rounded-xl border bg-muted/30 px-3 py-3">
            <p className="text-xs text-muted-foreground">{i18n.t("budgets.editor.usual")}</p>
            <div className="flex flex-wrap gap-2">
              {hints.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => {
                    setAmount(String(Math.ceil(Number(h.value))));
                  }}
                  className="rounded-full border bg-card px-3 py-1 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {h.label}: <Money value={h.value} className="font-medium" />
                </button>
              ))}
            </div>
            {suggestion.data && Number(suggestion.data.current_month) > 0 && (
              <p className="text-xs text-muted-foreground">
                {i18n.t("budgets.editor.thisMonth")} <Money value={suggestion.data.current_month} />
              </p>
            )}
          </div>
        )}

        <FormField
          label={i18n.t("budgets.editor.threshold")}
          htmlFor="budget-threshold"
          hint={i18n.t("budgets.editor.thresholdHint")}
        >
          <Select value={threshold} onValueChange={setThreshold}>
            <SelectTrigger id="budget-threshold" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([...THRESHOLDS, Number(threshold)])]
                .sort((x, y) => x - y)
                .map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    {i18n.t("budgets.editor.thresholdOption", { pct: t })}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FormField>

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
        <Button type="submit" disabled={pending}>
          {pending
            ? i18n.t("budgets.editor.saving")
            : budget
              ? i18n.t("budgets.editor.save")
              : i18n.t("budgets.editor.create")}
        </Button>
      </SheetFooter>
    </form>
  );
}
