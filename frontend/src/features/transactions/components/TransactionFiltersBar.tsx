import { Search, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

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
import { cn } from "@/lib/utils";

import type { TransactionFilters } from "../filters";
import { KIND_LABELS, STATUS_LABELS, type TransactionKind } from "../labels";
import { accountLabel, type Lookups } from "../lookups";

const ALL = "all";

interface Props {
  filters: TransactionFilters;
  setFilter: <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) => void;
  reset: () => void;
  activeCount: number;
  lookups: Lookups;
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          "h-9 w-full bg-card",
          value !== ALL && "border-primary/50 text-foreground",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export function TransactionFiltersBar({ filters, setFilter, reset, activeCount, lookups }: Props) {
  // La ricerca parte dopo una breve pausa nella digitazione.
  const [query, setQuery] = useState(filters.q);
  // Se il filtro cambia da fuori (es. "Azzera"), il campo si allinea; senza toccare
  // uno spazio finale che si sta ancora digitando.
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    if (filters.q !== query.trim()) setQuery(filters.q);
  }
  useEffect(() => {
    const handle = setTimeout(() => {
      if (query.trim() !== filters.q) setFilter("q", query.trim());
    }, 300);
    return () => {
      clearTimeout(handle);
    };
  }, [query, filters.q, setFilter]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Cerca descrizione, controparte, note…"
            aria-label="Cerca nei movimenti"
            className="h-9 bg-card pl-9"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={filters.uncategorized}
            onClick={() => {
              setFilter("uncategorized", !filters.uncategorized);
            }}
            className={cn(
              "h-9 bg-card",
              filters.uncategorized && "border-primary/50 bg-primary/10 text-primary",
            )}
          >
            Da classificare
          </Button>
          {/* Sempre presente (nascosto se non serve), così comparendo non sposta i filtri. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            className={cn("h-9", activeCount === 0 && "invisible")}
            aria-hidden={activeCount === 0}
            tabIndex={activeCount === 0 ? -1 : undefined}
          >
            <X aria-hidden />
            Azzera ({activeCount})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <FilterSelect
          label="Conto"
          value={filters.account ? String(filters.account) : ALL}
          onChange={(v) => {
            setFilter("account", v === ALL ? null : Number(v));
          }}
        >
          <SelectItem value={ALL}>Tutti i conti</SelectItem>
          <SelectSeparator />
          {lookups.accounts
            .filter((a) => a.type !== "broker")
            .map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {accountLabel(a)}
              </SelectItem>
            ))}
        </FilterSelect>

        <FilterSelect
          label="Tipo"
          value={filters.kind ?? ALL}
          onChange={(v) => {
            setFilter("kind", v === ALL ? null : (v as TransactionKind));
          }}
        >
          <SelectItem value={ALL}>Tutti i tipi</SelectItem>
          <SelectSeparator />
          {(Object.keys(KIND_LABELS) as TransactionKind[]).map((kind) => (
            <SelectItem key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </SelectItem>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Categoria"
          value={filters.category ? String(filters.category) : ALL}
          onChange={(v) => {
            setFilter("category", v === ALL ? null : Number(v));
          }}
        >
          <SelectItem value={ALL}>Tutte le categorie</SelectItem>
          <SelectSeparator />
          {lookups.categories.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Stato"
          value={filters.status ?? ALL}
          onChange={(v) => {
            setFilter("status", v === ALL ? null : (v as "booked" | "pending"));
          }}
        >
          <SelectItem value={ALL}>Tutti gli stati</SelectItem>
          <SelectSeparator />
          <SelectItem value="booked">{STATUS_LABELS.booked}</SelectItem>
          <SelectItem value="pending">{STATUS_LABELS.pending}</SelectItem>
        </FilterSelect>
      </div>
    </div>
  );
}
