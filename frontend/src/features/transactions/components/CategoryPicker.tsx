import type { Category } from "@/api/client";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface CategoryChoice {
  categoryId: number | null;
  subcategoryId: number | null;
}

const NONE = "none";

function encode({ categoryId, subcategoryId }: CategoryChoice): string {
  if (subcategoryId !== null) return `s:${String(subcategoryId)}:${String(categoryId)}`;
  if (categoryId !== null) return `c:${String(categoryId)}`;
  return NONE;
}

function decode(value: string): CategoryChoice {
  const [type, a, b] = value.split(":");
  if (type === "s") return { subcategoryId: Number(a), categoryId: Number(b) };
  if (type === "c") return { categoryId: Number(a), subcategoryId: null };
  return { categoryId: null, subcategoryId: null };
}

/**
 * Un solo menu per categoria e sottocategoria: "Trasporti", "Trasporti › Treno", ...
 * Le categorie archiviate non compaiono (ma restano leggibili nei movimenti).
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  noneLabel = "Nessuna categoria",
  allowNone = true,
  label = "Categoria",
  className,
  id,
}: {
  categories: Category[];
  value: CategoryChoice;
  onChange: (value: CategoryChoice) => void;
  noneLabel?: string;
  allowNone?: boolean;
  label?: string;
  className?: string;
  id?: string;
}) {
  return (
    <Select
      value={encode(value)}
      onValueChange={(v) => {
        onChange(decode(v));
      }}
    >
      <SelectTrigger id={id} aria-label={label} className={cn("w-full bg-card", className)}>
        <SelectValue placeholder="Scegli una categoria" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {allowNone && (
          <>
            <SelectItem value={NONE}>{noneLabel}</SelectItem>
            <SelectSeparator />
          </>
        )}
        {categories
          .filter((c) => !c.is_archived)
          .map((c) => (
            <SelectGroup key={c.id}>
              <SelectItem value={`c:${String(c.id)}`}>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <CategoryIcon name={c.icon} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{c.name}</span>
                </span>
              </SelectItem>
              {c.subcategories
                .filter((s) => !s.is_archived)
                .map((s) => (
                  <SelectItem
                    key={s.id}
                    value={`s:${String(s.id)}:${String(c.id)}`}
                    className="pl-9"
                  >
                    <span className="text-muted-foreground">{c.name} ›</span> {s.name}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
      </SelectContent>
    </Select>
  );
}
