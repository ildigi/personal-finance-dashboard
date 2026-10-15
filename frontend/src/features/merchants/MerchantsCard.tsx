import { Check, Merge, Pencil, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";

import { InlineNameInput } from "@/components/common/InlineNameInput";
import { Money } from "@/components/common/Money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryPicker } from "@/features/transactions/components/CategoryPicker";
import { transactionsUrl } from "@/features/transactions/filters";
import type { Lookups } from "@/features/transactions/lookups";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useMergeMerchant, useMerchants, useUpdateMerchant, type Merchant } from "./queries";

const ORIGIN = { seed: "Noto", auto: "Riconosciuto", user: "Tuo" } as const;

function MergeTarget({ merchant, onDone }: { merchant: Merchant; onDone: () => void }) {
  const [q, setQ] = useState("");
  const results = useMerchants(q.trim(), { limit: 6, usedOnly: false });
  const merge = useMergeMerchant();
  return (
    <div className="col-span-full space-y-1.5 rounded-lg border bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
          }}
          placeholder={`Unisci «${merchant.name}» in… (cerca)`}
          aria-label="Cerca il merchant in cui unire"
          className="h-8 bg-card"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onDone}
          aria-label="Annulla"
        >
          <X aria-hidden />
        </Button>
      </div>
      {q.trim().length >= 2 && (
        <ul className="text-sm">
          {(results.data?.items ?? [])
            .filter((m) => m.id !== merchant.id)
            .map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={merge.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Unire «${merchant.name}» in «${m.name}»? I movimenti e le varianti del nome passano a «${m.name}».`,
                      )
                    ) {
                      merge.mutate({ id: merchant.id, intoId: m.id }, { onSuccess: onDone });
                    }
                  }}
                  className="flex w-full justify-between rounded-md px-2 py-1.5 text-left hover:bg-accent"
                >
                  <span className="truncate">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatCount(m.transaction_count)} mov.
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// Stesso riquadro per il nome e per il campo che lo sostituisce: la riga non si muove.
const NAME_BOX = "-mx-1 h-5 rounded-md px-1 text-sm leading-5 font-medium";

function MerchantRow({ merchant, lookups }: { merchant: Merchant; lookups: Lookups }) {
  const update = useUpdateMerchant();
  const [merging, setMerging] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const name = (update.isPending ? update.variables.body.name : null) ?? merchant.name;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-2.5 md:grid-cols-[minmax(0,1fr)_14rem_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {renaming ? (
            <InlineNameInput
              id={inputId}
              initial={merchant.name}
              label={`Nuovo nome di ${merchant.name}`}
              className={NAME_BOX}
              onCommit={(value) => {
                setRenaming(false);
                update.mutate({ id: merchant.id, body: { name: value } });
              }}
              onCancel={() => {
                setRenaming(false);
              }}
              returnFocus={() => renameButton.current}
            />
          ) : (
            <Link
              to={transactionsUrl({ merchant: merchant.id })}
              className={cn(NAME_BOX, "truncate hover:underline")}
            >
              {name}
            </Link>
          )}
          <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
            {ORIGIN[merchant.origin]}
          </Badge>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {formatCount(merchant.transaction_count)} movimenti · speso{" "}
          <Money value={merchant.spent_eur} />
        </div>
      </div>
      <div className="flex gap-1 md:order-last">
        <Button
          ref={renameButton}
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={renaming ? `Salva il nome di ${merchant.name}` : `Rinomina ${merchant.name}`}
          // In modifica il clic conferma: il campo non deve perdere il focus prima del clic.
          onMouseDown={(event) => {
            if (renaming) event.preventDefault();
          }}
          onClick={() => {
            if (renaming) document.getElementById(inputId)?.blur();
            else setRenaming(true);
          }}
        >
          {renaming ? <Check aria-hidden /> : <Pencil aria-hidden />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Unisci ${merchant.name} in un altro merchant`}
          onClick={() => {
            setMerging(true);
          }}
        >
          <Merge aria-hidden />
        </Button>
      </div>
      <CategoryPicker
        categories={lookups.categories}
        value={{
          categoryId: merchant.default_category_id,
          subcategoryId: merchant.default_subcategory_id,
        }}
        noneLabel="Nessuna categoria predefinita"
        label={`Categoria predefinita di ${merchant.name}`}
        className="col-span-2 h-8 text-xs md:col-span-1"
        onChange={(choice) => {
          update.mutate({
            id: merchant.id,
            body: {
              default_category_id: choice.categoryId,
              default_subcategory_id: choice.subcategoryId,
            },
          });
        }}
      />
      {merging && (
        <MergeTarget
          merchant={merchant}
          onDone={() => {
            setMerging(false);
          }}
        />
      )}
    </li>
  );
}

/**
 * Merchant riconosciuti: nome, categoria predefinita (vale per i movimenti passati e
 * futuri, dopo regole e correzioni) e unione delle varianti ("AMZN Mktp" → Amazon).
 */
export function MerchantsCard({ lookups }: { lookups: Lookups }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(input.trim());
    }, 250);
    return () => {
      clearTimeout(handle);
    };
  }, [input]);
  const { data, isPending } = useMerchants(q, { limit: 30 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merchant</CardTitle>
        <CardDescription>
          Per spesa decrescente. La categoria predefinita si applica ai movimenti senza una regola o
          una correzione.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
            }}
            placeholder="Cerca un merchant"
            aria-label="Cerca un merchant"
            className="bg-card pl-9"
          />
        </div>
        {isPending ? (
          <Skeleton className="h-60 w-full" />
        ) : (
          <>
            <ul className="divide-y">
              {(data?.items ?? []).map((m) => (
                <MerchantRow key={m.id} merchant={m} lookups={lookups} />
              ))}
            </ul>
            {data && data.total > data.items.length && (
              <p className="text-xs text-muted-foreground">
                Mostrati {formatCount(data.items.length)} di {formatCount(data.total)}: cerca per
                trovare gli altri.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
