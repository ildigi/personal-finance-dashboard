import { Archive, ArchiveRestore, Merge, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type RefObject, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

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
import { i18n } from "@/i18n";
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
  const { t } = useTranslation();
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
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
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

type CountedUse = "transactions" | "overrides" | "rules" | "recurring" | "merchants";

const counted = (key: CountedUse, count: number): string =>
  i18n.t(`categories.usage.${key}`, { count, n: formatCount(count) });

function usageLines(usage: Usage): string[] {
  const lines: string[] = [];
  if (usage.transactions) lines.push(counted("transactions", usage.transactions));
  if (usage.overrides) lines.push(counted("overrides", usage.overrides));
  if (usage.rules) lines.push(counted("rules", usage.rules));
  if (usage.budgets) lines.push(i18n.t("categories.usage.budget"));
  if (usage.recurring) lines.push(counted("recurring", usage.recurring));
  if (usage.merchants) lines.push(counted("merchants", usage.merchants));
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
  const { t } = useTranslation();
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
          <AlertDialogTitle>{t("categories.deleteTitle", { name: sub.name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {usage === undefined
              ? t("categories.subcategory.of", { category: category.name })
              : inUse
                ? t("categories.subcategory.inUse", { uses: usageLines(usage).join(", ") })
                : t("categories.subcategory.unused")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {usage === undefined ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          inUse && (
            <div className="space-y-2">
              <label htmlFor={`move-${sub.id}`} className="text-sm font-medium">
                {t("categories.subcategory.moveTo")}
              </label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id={`move-${sub.id}`} className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUBCATEGORY}>
                    {t("categories.subcategory.none", { category: category.name })}
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
                    ? t("categories.subcategory.budgetMoves", { target: targetName })
                    : t("categories.subcategory.budgetDeleted", {
                        name: sub.name,
                        category: category.name,
                      })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("categories.subcategory.archiveHint")}
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
          <AlertDialogCancel disabled={remove.isPending}>{t("common.cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={usage === undefined || remove.isPending}
            onClick={confirm}
          >
            <Trash2 aria-hidden />
            {inUse ? t("categories.subcategory.moveAndDelete") : t("common.delete")}
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
  const { t } = useTranslation();
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
            label={t("categories.subcategory.renameLabel", { name: sub.name })}
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
            aria-label={t("categories.subcategory.actions", { name })}
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
            {t("common.rename")}
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
            {sub.is_archived ? t("common.restore") : t("common.archive")}
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
            {t("common.deleteEllipsis")}
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
  const { t } = useTranslation();
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
            label={t("categories.subcategory.newLabel", { name: category.name })}
            placeholder={t("categories.subcategory.newPlaceholder")}
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
            aria-label={t("categories.subcategory.addLabel", { name: category.name })}
            title={t("categories.subcategory.addTitle")}
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
  const { t } = useTranslation();
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
              label={t("categories.renameLabel", { name: category.name })}
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
              {t("categories.excluded")}
            </Badge>
          )}
          {category.is_system && (
            <Badge variant="outline" className="text-[10px]">
              {t("categories.system")}
            </Badge>
          )}
          {category.is_archived && (
            <Badge variant="outline" className="text-[10px]">
              {t("categories.archived")}
            </Badge>
          )}
        </div>
        <ul
          className="mt-1 flex flex-wrap gap-1"
          aria-label={t("categories.subcategoriesOf", { name })}
        >
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
            aria-label={t("categories.actionsFor", { name })}
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
            {t("common.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              menu.after(() => {
                setAdding(true);
              });
            }}
          >
            <Plus aria-hidden />
            {t("categories.addSubcategory")}
          </DropdownMenuItem>
          {!category.is_system && (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={targets.length === 0}>
                  <Merge aria-hidden />
                  {t("categories.mergeInto")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  {targets.map((target) => (
                    <DropdownMenuItem
                      key={target.id}
                      onSelect={() => {
                        menu.after(() => {
                          onConfirm({
                            title: t("categories.mergeTitle", {
                              from: category.name,
                              to: target.name,
                            }),
                            description: t("categories.mergeDescription", {
                              from: category.name,
                              to: target.name,
                            }),
                            action: t("categories.merge"),
                            run: () => {
                              merge.mutate(
                                { id: category.id, intoId: target.id },
                                { onError: fail },
                              );
                            },
                            returnFocus: actions.current,
                          });
                        });
                      }}
                    >
                      <CategoryIcon name={target.icon} />
                      {target.name}
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
                {category.is_archived ? t("common.restore") : t("common.archive")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  menu.after(() => {
                    onConfirm({
                      title: t("categories.deleteTitle", { name: category.name }),
                      description: t("categories.deleteDescription"),
                      action: t("common.delete"),
                      run: () => {
                        remove.mutate(category.id, { onError: fail });
                      },
                      returnFocus: actions.current,
                    });
                  });
                }}
              >
                <Trash2 aria-hidden />
                {t("common.deleteEllipsis")}
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
  const { t } = useTranslation();
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
        <CardTitle>{t("categories.title")}</CardTitle>
        <CardDescription>{t("categories.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            maxLength={100}
            placeholder={t("categories.newPlaceholder")}
            aria-label={t("categories.newLabel")}
            className="bg-card"
          />
          <Button type="submit" variant="outline" disabled={!name.trim() || create.isPending}>
            <Plus aria-hidden />
            {t("common.add")}
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
            {t("common.backendDown")}
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
