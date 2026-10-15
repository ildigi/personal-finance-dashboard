import { Archive, ArchiveRestore, Merge, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type RefObject, type SyntheticEvent } from "react";

import type { Category, Schemas } from "@/api/client";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { InlineNameInput } from "@/components/common/InlineNameInput";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  useAllCategories,
  useCreateCategory,
  useCreateSubcategory,
  useDeleteCategory,
  useDeleteSubcategory,
  useMergeCategory,
  useSubcategoryUsage,
  useUpdateCategory,
  useUpdateSubcategory,
} from "./queries";

type Subcategory = Schemas["SubcategoryRead"];
type Usage = Schemas["SubcategoryUsage"];

// Stesso riquadro per il testo e per il campo che lo sostituisce in modifica: altezza,
// bordo e padding identici, quindi la riga non cambia misura né si sposta.
const NAME_BOX = "-mx-1 h-5 rounded-md px-1 text-sm leading-5 font-medium";
const CHIP_BOX = "inline-flex h-6 items-center rounded-full border px-2 text-xs";

/**
 * Le voci che aprono un campo o un dialogo agiscono a menu chiuso: finché è aperto il menu
 * trattiene il focus, e chiudendosi lo riporterebbe al proprio pulsante.
 */
function useAfterMenuClose() {
  const pending = useRef<(() => void) | null>(null);
  return {
    after: (action: () => void) => {
      pending.current = action;
    },
    onCloseAutoFocus: (event: Event) => {
      const action = pending.current;
      if (action) {
        event.preventDefault();
        pending.current = null;
        action();
      }
    },
  };
}

interface Confirmation {
  title: string;
  description: string;
  action: string;
  run: () => void;
  /** Dove torna il focus alla chiusura (il pulsante del menu da cui è partita). */
  returnFocus: HTMLElement | null;
}

function ConfirmDialog({
  confirmation,
  open,
  onOpenChange,
}: {
  confirmation: Confirmation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Resta l'ultima conferma anche mentre il dialogo si chiude (niente testo che sparisce). */}
      {confirmation && (
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            confirmation.returnFocus?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                confirmation.run();
                onOpenChange(false);
              }}
            >
              {confirmation.action}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}

// --- Eliminazione di una sottocategoria -------------------------------------------------

const plural = (n: number, one: string, many: string) =>
  `${formatCount(n)} ${n === 1 ? one : many}`;

function usageLines(usage: Usage): string[] {
  const lines: string[] = [];
  if (usage.transactions) lines.push(plural(usage.transactions, "movimento", "movimenti"));
  if (usage.overrides)
    lines.push(plural(usage.overrides, "correzione manuale", "correzioni manuali"));
  if (usage.rules) lines.push(plural(usage.rules, "regola", "regole"));
  if (usage.budgets) lines.push("il suo budget");
  if (usage.recurring) lines.push(plural(usage.recurring, "ricorrenza", "ricorrenze"));
  if (usage.merchants)
    lines.push(`${plural(usage.merchants, "merchant", "merchant")} (categoria predefinita)`);
  return lines;
}

const NO_SUBCATEGORY = "none";

function DeleteSubcategoryDialog({
  sub,
  category,
  usage,
  open,
  onOpenChange,
  onClosed,
}: {
  sub: Subcategory;
  category: Category;
  usage: Usage | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: () => void;
}) {
  const remove = useDeleteSubcategory();
  const [target, setTarget] = useState(NO_SUBCATEGORY);
  const [error, setError] = useState<string | null>(null);
  const siblings = category.subcategories.filter((s) => s.id !== sub.id && !s.is_archived);
  const targetName =
    target === NO_SUBCATEGORY ? null : siblings.find((s) => String(s.id) === target)?.name;
  const inUse = usage?.in_use ?? false;

  function confirm(): void {
    setError(null);
    remove.mutate(
      { id: sub.id, inUse, intoId: target === NO_SUBCATEGORY ? null : Number(target) },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
        onError: (err) => {
          setError(err.message);
        },
      },
    );
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!remove.isPending) onOpenChange(next);
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare «{sub.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            {usage === undefined
              ? `Sottocategoria di «${category.name}».`
              : inUse
                ? `È usata da ${usageLines(usage).join(", ")}. Scegli dove spostarli: nessuna classificazione va persa.`
                : "Nessun movimento, regola o budget la usa: viene eliminata subito."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {usage === undefined ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          inUse && (
            <div className="space-y-2">
              <label htmlFor={`move-${sub.id}`} className="text-sm font-medium">
                Sposta su
              </label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id={`move-${sub.id}`} className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUBCATEGORY}>
                    Nessuna sottocategoria (resta in «{category.name}»)
                  </SelectItem>
                  {siblings.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {usage.budgets > 0 && (
                <p className="text-xs text-muted-foreground">
                  {targetName
                    ? `Il budget passa a «${targetName}» (se ne ha già uno, gli importi si sommano).`
                    : `Il budget di «${sub.name}» viene eliminato: la spesa resta nel budget di «${category.name}», se c'è.`}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Se vuoi solo nasconderla, archiviala: i movimenti passati restano dove sono.
              </p>
            </div>
          )
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Annulla</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={usage === undefined || remove.isPending}
            onClick={confirm}
          >
            <Trash2 aria-hidden />
            {inUse ? "Sposta ed elimina" : "Elimina"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// --- Sottocategoria ---------------------------------------------------------------------

function SubcategoryChip({
  sub,
  category,
  onError,
}: {
  sub: Subcategory;
  category: Category;
  onError: (m: string) => void;
}) {
  const update = useUpdateSubcategory();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useAfterMenuClose();
  // Chiesto già all'apertura del menu: il dialogo di eliminazione si apre con i numeri pronti.
  const usage = useSubcategoryUsage(sub.id, menuOpen || deleting);
  const name = (update.isPending ? update.variables.body.name : null) ?? sub.name;
  const fail = (error: Error) => {
    onError(error.message);
  };

  return (
    <li>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {renaming ? (
          <InlineNameInput
            initial={sub.name}
            label={`Nuovo nome della sottocategoria ${sub.name}`}
            className={cn(CHIP_BOX, "text-foreground")}
            onCommit={(value) => {
              setRenaming(false);
              update.mutate({ id: sub.id, body: { name: value } }, { onError: fail });
            }}
            onCancel={() => {
              setRenaming(false);
            }}
            returnFocus={() => trigger.current}
          />
        ) : (
          <DropdownMenuTrigger
            ref={trigger}
            className={cn(
              CHIP_BOX,
              "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              sub.is_archived && "line-through opacity-60",
            )}
            aria-label={`Azioni per la sottocategoria ${name}`}
          >
            {name}
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent align="start" onCloseAutoFocus={menu.onCloseAutoFocus}>
          <DropdownMenuItem
            onSelect={() => {
              menu.after(() => {
                setRenaming(true);
              });
            }}
          >
            <Pencil aria-hidden />
            Rinomina
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              update.mutate(
                { id: sub.id, body: { is_archived: !sub.is_archived } },
                { onError: fail },
              );
            }}
          >
            {sub.is_archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            {sub.is_archived ? "Ripristina" : "Archivia"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              menu.after(() => {
                setDeleting(true);
              });
            }}
          >
            <Trash2 aria-hidden />
            Elimina…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteSubcategoryDialog
        sub={sub}
        category={category}
        usage={usage.data}
        open={deleting}
        onOpenChange={setDeleting}
        onClosed={() => trigger.current?.focus()}
      />
    </li>
  );
}

/** Chip "+" in coda alle sottocategorie: diventa il campo del nome, nello stesso punto. */
function AddSubcategoryChip({
  category,
  adding,
  setAdding,
  chip,
  onError,
}: {
  category: Category;
  adding: boolean;
  setAdding: (adding: boolean) => void;
  chip: RefObject<HTMLButtonElement | null>;
  onError: (m: string) => void;
}) {
  const create = useCreateSubcategory();
  return (
    <>
      {create.isPending && (
        <li className={cn(CHIP_BOX, "text-muted-foreground opacity-60")}>
          {create.variables.name}
        </li>
      )}
      <li>
        {adding ? (
          <InlineNameInput
            label={`Nome della nuova sottocategoria di ${category.name}`}
            placeholder="Nuova sottocategoria"
            leading={<Plus aria-hidden className="mr-1 size-3 shrink-0" />}
            className={cn(CHIP_BOX, "text-foreground")}
            onCommit={(name) => {
              setAdding(false);
              create.mutate(
                { categoryId: category.id, name },
                {
                  onError: (error) => {
                    onError(error.message);
                  },
                },
              );
            }}
            onCancel={() => {
              setAdding(false);
            }}
            returnFocus={() => chip.current}
          />
        ) : (
          <button
            ref={chip}
            type="button"
            onClick={() => {
              setAdding(true);
            }}
            className={cn(
              CHIP_BOX,
              "border-dashed px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
            aria-label={`Aggiungi una sottocategoria a ${category.name}`}
            title="Aggiungi una sottocategoria"
          >
            <Plus aria-hidden className="size-3" />
          </button>
        )}
      </li>
    </>
  );
}

// --- Categoria --------------------------------------------------------------------------

function CategoryRow({
  category,
  all,
  onError,
  onConfirm,
}: {
  category: Category;
  all: Category[];
  onError: (m: string) => void;
  onConfirm: (c: Confirmation) => void;
}) {
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const merge = useMergeCategory();
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const actions = useRef<HTMLButtonElement>(null);
  const addChip = useRef<HTMLButtonElement>(null);
  const menu = useAfterMenuClose();
  const name = (update.isPending ? update.variables.body.name : null) ?? category.name;
  const fail = (error: Error) => {
    onError(error.message);
  };
  const targets = all.filter(
    (c) => c.id !== category.id && !c.is_archived && c.kind === category.kind,
  );

  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border px-3 py-2.5",
        category.is_archived && "opacity-60",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <CategoryIcon name={category.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {renaming ? (
            <InlineNameInput
              initial={category.name}
              label={`Nuovo nome della categoria ${category.name}`}
              className={NAME_BOX}
              onCommit={(value) => {
                setRenaming(false);
                update.mutate({ id: category.id, body: { name: value } }, { onError: fail });
              }}
              onCancel={() => {
                setRenaming(false);
              }}
              returnFocus={() => actions.current}
            />
          ) : (
            <span className={cn(NAME_BOX, "truncate")}>{name}</span>
          )}
          {category.excluded_from_spending && (
            <Badge variant="secondary" className="text-[10px]">
              Fuori dalle spese
            </Badge>
          )}
          {category.is_system && (
            <Badge variant="outline" className="text-[10px]">
              Sistema
            </Badge>
          )}
          {category.is_archived && (
            <Badge variant="outline" className="text-[10px]">
              Archiviata
            </Badge>
          )}
        </div>
        <ul className="mt-1 flex flex-wrap gap-1" aria-label={`Sottocategorie di ${name}`}>
          {category.subcategories.map((sub) => (
            <SubcategoryChip key={sub.id} sub={sub} category={category} onError={onError} />
          ))}
          <AddSubcategoryChip
            category={category}
            adding={adding}
            setAdding={setAdding}
            chip={addChip}
            onError={onError}
          />
        </ul>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={actions}
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`Azioni per ${name}`}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={menu.onCloseAutoFocus}>
          <DropdownMenuItem
            onSelect={() => {
              menu.after(() => {
                setRenaming(true);
              });
            }}
          >
            <Pencil aria-hidden />
            Rinomina
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              menu.after(() => {
                setAdding(true);
              });
            }}
          >
            <Plus aria-hidden />
            Aggiungi sottocategoria
          </DropdownMenuItem>
          {!category.is_system && (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={targets.length === 0}>
                  <Merge aria-hidden />
                  Unisci in…
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  {targets.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onSelect={() => {
                        menu.after(() => {
                          onConfirm({
                            title: `Unire «${category.name}» in «${t.name}»?`,
                            description: `Movimenti, regole, budget e merchant passano a «${t.name}» e «${category.name}» viene eliminata.`,
                            action: "Unisci",
                            run: () => {
                              merge.mutate({ id: category.id, intoId: t.id }, { onError: fail });
                            },
                            returnFocus: actions.current,
                          });
                        });
                      }}
                    >
                      <CategoryIcon name={t.icon} />
                      {t.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onSelect={() => {
                  update.mutate(
                    { id: category.id, body: { is_archived: !category.is_archived } },
                    { onError: fail },
                  );
                }}
              >
                {category.is_archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                {category.is_archived ? "Ripristina" : "Archivia"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  menu.after(() => {
                    onConfirm({
                      title: `Eliminare «${category.name}»?`,
                      description:
                        "Si elimina con le sue sottocategorie. Se è in uso non si può: archiviala o uniscila a un'altra.",
                      action: "Elimina",
                      run: () => {
                        remove.mutate(category.id, { onError: fail });
                      },
                      returnFocus: actions.current,
                    });
                  });
                }}
              >
                <Trash2 aria-hidden />
                Elimina…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Categorie e sottocategorie: rinomina, aggiungi, unisci, archivia, elimina (SPEC §11). */
export function CategoriesManager() {
  const { data, isPending, isError } = useAllCategories();
  const create = useCreateCategory();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirming, setConfirming] = useState(false);

  function onSubmit(event: SyntheticEvent): void {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    setError(null);
    create.mutate(value, {
      onSuccess: () => {
        setName("");
      },
      onError: (err) => {
        setError(err.message);
      },
    });
  }

  const all = data ?? [];
  const sorted = [...all.filter((c) => !c.is_archived), ...all.filter((c) => c.is_archived)];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categorie di spesa</CardTitle>
        <CardDescription>
          Rinomina, aggiungi, unisci, archivia o elimina. Le categorie in uso non si eliminano:
          archiviale o uniscile a un'altra; eliminando una sottocategoria in uso scegli dove
          spostarne movimenti e regole.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            maxLength={100}
            placeholder="Nuova categoria, es. Casa"
            aria-label="Nome della nuova categoria"
            className="bg-card"
          />
          <Button type="submit" variant="outline" disabled={!name.trim() || create.isPending}>
            <Plus aria-hidden />
            Aggiungi
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {isPending ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Dati non disponibili: il backend non risponde.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {sorted.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                all={all}
                onError={setError}
                onConfirm={(c) => {
                  setConfirmation(c);
                  setConfirming(true);
                }}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog confirmation={confirmation} open={confirming} onOpenChange={setConfirming} />
    </Card>
  );
}
