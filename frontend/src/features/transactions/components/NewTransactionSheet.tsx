import { useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, parseAmountInput } from "@/lib/format";
import { todayInRome } from "@/lib/period";
import { cn } from "@/lib/utils";

import { accountLabel, type Lookups } from "../lookups";
import { useCreateTransaction } from "../queries";

const NONE = "none";

interface Errors {
  account?: string;
  date?: string;
  amount?: string;
  description?: string;
  form?: string;
}

/**
 * Inserimento manuale (es. carta di credito CA se non esposta via PSD2).
 * Validazione qui per un riscontro immediato; il backend rivalida comunque.
 */
export function NewTransactionSheet({
  open,
  onOpenChange,
  lookups,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: Lookups;
  onCreated: (id: number) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateTransaction();
  const accounts = lookups.accounts.filter((a) => a.type !== "broker");
  const defaultAccount =
    accounts.find((a) => a.type === "credit_card") ??
    (accounts.length > 0 ? accounts[0] : undefined);

  const [accountId, setAccountId] = useState<string>("");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [date, setDate] = useState(todayInRome());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(NONE);
  const [subcategoryId, setSubcategoryId] = useState(NONE);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const selectedAccount = accountId || (defaultAccount ? String(defaultAccount.id) : "");
  const category = categoryId !== NONE ? lookups.categoryById.get(Number(categoryId)) : undefined;
  const parsed = parseAmountInput(amount);

  function clearError(field: keyof Errors): void {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function reset(): void {
    setDirection("out");
    setDate(todayInRome());
    setAmount("");
    setDescription("");
    setCategoryId(NONE);
    setSubcategoryId(NONE);
    setNotes("");
    setErrors({});
  }

  function onSubmit(event: SyntheticEvent): void {
    event.preventDefault();
    const next: Errors = {};
    if (!selectedAccount) next.account = t("transactions.new.errors.account");
    if (!date) next.date = t("transactions.new.errors.date");
    else if (date > todayInRome()) next.date = t("transactions.new.errors.future");
    if (!parsed) next.amount = t("transactions.new.errors.amount");
    if (!description.trim()) next.description = t("transactions.new.errors.description");
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed) return;

    create.mutate(
      {
        account_id: Number(selectedAccount),
        booking_date: date,
        amount: direction === "out" ? `-${parsed}` : parsed,
        currency: "EUR",
        description: description.trim(),
        category_id: categoryId !== NONE ? Number(categoryId) : null,
        subcategory_id: subcategoryId !== NONE ? Number(subcategoryId) : null,
        notes: notes.trim() || null,
      },
      {
        onSuccess: (tx) => {
          reset();
          onOpenChange(false);
          onCreated(tx.id);
        },
        onError: (error) => {
          setErrors({
            form: error instanceof ApiError ? error.message : t("transactions.new.errors.save"),
          });
        },
      },
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) setErrors({});
        onOpenChange(value);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-card sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("transactions.new.title")}</SheetTitle>
          <SheetDescription>{t("transactions.new.description")}</SheetDescription>
        </SheetHeader>

        <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
          <div className="space-y-5 p-4">
            <div
              role="radiogroup"
              aria-label={t("transactions.new.direction")}
              className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
            >
              {(
                [
                  ["out", t("transactions.new.out")],
                  ["in", t("transactions.new.in")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={direction === value}
                  onClick={() => {
                    setDirection(value);
                  }}
                  className={cn(
                    "min-h-10 rounded-lg text-sm transition-colors",
                    direction === value
                      ? "bg-card font-medium shadow-card"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">{t("transactions.new.amount")}</Label>
              <Input
                id="tx-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder={t("transactions.new.amountPlaceholder")}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  clearError("amount");
                }}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby="tx-amount-hint"
                className="h-12 text-2xl font-semibold"
              />
              <p
                id="tx-amount-hint"
                className={cn(
                  "text-xs",
                  errors.amount ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {errors.amount ??
                  (parsed
                    ? t("transactions.new.willBe", {
                        amount: formatMoney(direction === "out" ? `-${parsed}` : parsed, "EUR", {
                          signed: true,
                        }),
                      })
                    : t("transactions.new.decimalsHint"))}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tx-description">{t("transactions.new.descriptionLabel")}</Label>
              <Input
                id="tx-description"
                placeholder={t("transactions.new.descriptionPlaceholder")}
                value={description}
                maxLength={500}
                onChange={(e) => {
                  setDescription(e.target.value);
                  clearError("description");
                }}
                aria-invalid={Boolean(errors.description)}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tx-date">{t("transactions.new.date")}</Label>
                <Input
                  id="tx-date"
                  type="date"
                  value={date}
                  max={todayInRome()}
                  onChange={(e) => {
                    setDate(e.target.value);
                  }}
                  aria-invalid={Boolean(errors.date)}
                />
                {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-account">{t("transactions.account")}</Label>
                <Select value={selectedAccount} onValueChange={setAccountId}>
                  <SelectTrigger
                    id="tx-account"
                    className="w-full"
                    aria-invalid={Boolean(errors.account)}
                  >
                    <SelectValue placeholder={t("transactions.new.choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {accountLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.account && <p className="text-xs text-destructive">{errors.account}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tx-category">{t("transactions.filters.category")}</Label>
                <Select
                  value={categoryId}
                  onValueChange={(value) => {
                    setCategoryId(value);
                    setSubcategoryId(NONE);
                  }}
                >
                  <SelectTrigger id="tx-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("transactions.unclassified")}</SelectItem>
                    {lookups.categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-subcategory">{t("transactions.new.subcategory")}</Label>
                <Select
                  value={subcategoryId}
                  onValueChange={setSubcategoryId}
                  disabled={!category || category.subcategories.length === 0}
                >
                  <SelectTrigger id="tx-subcategory" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("transactions.editor.none")}</SelectItem>
                    {category?.subcategories.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tx-notes">{t("transactions.new.notes")}</Label>
              <Textarea
                id="tx-notes"
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
              />
            </div>

            {errors.form && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {errors.form}
              </p>
            )}
          </div>

          <SheetFooter className="mt-auto border-t">
            <Button type="submit" disabled={create.isPending} className="w-full">
              {create.isPending ? t("transactions.new.saving") : t("transactions.new.save")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
