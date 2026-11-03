import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo } from "react";

import { Money } from "@/components/common/Money";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { i18n } from "@/i18n";
import { cn } from "@/lib/utils";

import type { TransactionFilters } from "../filters";
import { statusLabel } from "../labels";
import { accountLabel, transactionDescription, type Lookups } from "../lookups";
import type { Transaction } from "../queries";
import { CategoryLabel } from "./CategoryLabel";

const column = createColumnHelper<Transaction>();

type Sort = TransactionFilters["sort"];

function SortHeader({
  label,
  field,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  field: "date" | "amount";
  sort: Sort;
  onSort: (sort: Sort) => void;
  align?: "left" | "right";
}) {
  const active = sort.startsWith(field);
  const desc = sort.endsWith("desc");
  const Icon = !active ? ArrowUpDown : desc ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => {
        onSort(active && desc ? `${field}_asc` : `${field}_desc`);
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        align === "right" && "flex-row-reverse",
        active && "text-foreground",
      )}
      aria-label={i18n.t("transactions.table.sortBy", { label: label.toLowerCase() })}
    >
      {label}
      <Icon aria-hidden className={cn("size-3.5", !active && "opacity-50")} />
    </button>
  );
}

interface Props {
  rows: Transaction[];
  lookups: Lookups;
  sort: Sort;
  onSort: (sort: Sort) => void;
  onOpen: (id: number) => void;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: number[], select: boolean) => void;
}

function Check({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={onChange}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
      aria-label={label}
      className="size-4 cursor-pointer rounded align-middle accent-primary"
    />
  );
}

/** Tabella dei movimenti per schermi larghi. Ordinamento e filtri sono lato server. */
export function TransactionTable({
  rows,
  lookups,
  sort,
  onSort,
  onOpen,
  selected,
  onToggle,
  onToggleAll,
}: Props) {
  const ids = rows.map((r) => r.id);
  const selectedHere = ids.filter((id) => selected.has(id)).length;
  const allSelected = ids.length > 0 && selectedHere === ids.length;
  const columns = useMemo(
    () => [
      column.display({
        id: "select",
        header: () => (
          <Check
            checked={allSelected}
            indeterminate={selectedHere > 0 && !allSelected}
            onChange={() => {
              onToggleAll(ids, !allSelected);
            }}
            label={i18n.t("transactions.table.selectAll")}
          />
        ),
        cell: ({ row }) => (
          <Check
            checked={selected.has(row.original.id)}
            onChange={() => {
              onToggle(row.original.id);
            }}
            label={i18n.t("transactions.table.select", { name: row.original.description_clean })}
          />
        ),
      }),
      column.accessor("booking_date", {
        header: () => (
          <SortHeader
            label={i18n.t("transactions.table.date")}
            field="date"
            sort={sort}
            onSort={onSort}
          />
        ),
        cell: (info) => (
          <span className="num text-muted-foreground">{formatDate(info.getValue(), "short")}</span>
        ),
      }),
      column.accessor("description_clean", {
        header: () => i18n.t("transactions.table.description"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium" title={row.original.description_raw}>
                {row.original.merchant_name ?? transactionDescription(row.original, lookups)}
              </span>
              {row.original.status === "pending" && (
                <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                  {statusLabel("pending")}
                </Badge>
              )}
              {row.original.is_manual && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {i18n.t("transactions.table.manual")}
                </Badge>
              )}
            </div>
            {(row.original.merchant_name ?? row.original.counterparty_name) && (
              <div className="truncate text-xs text-muted-foreground">
                {row.original.merchant_name
                  ? transactionDescription(row.original, lookups)
                  : row.original.counterparty_name}
              </div>
            )}
          </div>
        ),
      }),
      column.accessor("account_id", {
        header: () => i18n.t("transactions.account"),
        cell: (info) => (
          <span className="truncate text-muted-foreground">
            {accountLabel(lookups.accountById.get(info.getValue()))}
          </span>
        ),
      }),
      column.accessor("category_id", {
        header: () => i18n.t("transactions.filters.category"),
        cell: ({ row }) => (
          <CategoryLabel
            categoryId={row.original.category_id}
            subcategoryId={row.original.subcategory_id}
            kind={row.original.kind}
            incomeTypeId={row.original.income_type_id}
            lookups={lookups}
          />
        ),
      }),
      column.accessor("amount", {
        header: () => (
          <SortHeader
            label={i18n.t("transactions.table.amount")}
            field="amount"
            sort={sort}
            onSort={onSort}
            align="right"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <Money
              value={row.original.amount}
              currency={row.original.currency}
              signed
              tone="auto"
              className="num font-medium"
            />
            {row.original.original_currency && row.original.original_amount && (
              <div className="text-xs text-muted-foreground">
                <Money
                  value={row.original.original_amount}
                  currency={row.original.original_currency}
                  className="num"
                />
              </div>
            )}
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ids` deriva da `rows`
    [lookups, sort, onSort, selected, onToggle, onToggleAll, allSelected, selectedHere, rows],
  );

  // TanStack Table v8 non è compatibile con React Compiler: qui la memoizzazione non serve.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    getRowId: (row) => String(row.id),
  });

  return (
    <table className="w-full table-fixed text-sm">
      <colgroup>
        <col className="w-12" />
        <col className="w-20" />
        <col />
        <col className="w-52" />
        <col className="w-56" />
        <col className="w-36" />
      </colgroup>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id} className="border-b text-left text-xs text-muted-foreground">
            {group.headers.map((header, index) => (
              <th
                key={header.id}
                scope="col"
                className={cn(
                  "px-3 py-2.5 font-medium",
                  index === 0 && "pl-5",
                  index === group.headers.length - 1 && "pr-5 text-right",
                )}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr
            key={row.id}
            tabIndex={0}
            onClick={() => {
              onOpen(row.original.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(row.original.id);
              }
            }}
            aria-label={i18n.t("transactions.table.open", { name: row.original.description_clean })}
            aria-selected={selected.has(row.original.id)}
            className={cn(
              "cursor-pointer border-b last:border-0 hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:outline-none",
              selected.has(row.original.id) && "bg-primary/5",
            )}
          >
            {row.getVisibleCells().map((cell, index, cells) => (
              <td
                key={cell.id}
                className={cn(
                  "truncate px-3 py-3 align-middle",
                  index === 0 && "pl-5",
                  index === cells.length - 1 && "pr-5",
                )}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
