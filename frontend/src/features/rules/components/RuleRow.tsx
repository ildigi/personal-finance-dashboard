import { ArrowDown, ArrowUp, Clock, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router";

import { Switch } from "@/components/common/Switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { transactionsUrl } from "@/features/transactions/filters";
import type { Lookups } from "@/features/transactions/lookups";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

import { describeActions, describeConditions } from "../describe";
import type { Rule } from "../queries";
import { i18n } from "@/i18n";

export function RuleRow({
  rule,
  lookups,
  merchantNames,
  highlighted,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
  busy,
}: {
  rule: Rule;
  lookups: Lookups;
  merchantNames: Map<number, string>;
  highlighted: boolean;
  onToggle: (active: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMove?: (direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  busy: boolean;
}) {
  const conditions = describeConditions(rule.conditions, lookups, merchantNames);
  const actions = describeActions(rule.actions, lookups);
  return (
    <li
      id={`regola-${String(rule.id)}`}
      className={cn(
        "flex scroll-mt-24 flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5",
        !rule.is_active && "opacity-60",
        highlighted && "bg-primary/5 ring-1 ring-primary/40 ring-inset",
      )}
    >
      {onMove && (
        <div className="hidden shrink-0 flex-col sm:flex">
          <button
            type="button"
            disabled={!canMoveUp || busy}
            onClick={() => {
              onMove(-1);
            }}
            aria-label={i18n.t("rules.row.earlier", { name: rule.name })}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowUp aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown || busy}
            onClick={() => {
              onMove(1);
            }}
            aria-label={i18n.t("rules.row.later", { name: rule.name })}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ArrowDown aria-hidden className="size-4" />
          </button>
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{rule.name}</span>
          <Badge variant={rule.origin === "seed" ? "outline" : "secondary"} className="text-[10px]">
            {i18n.t(`rules.origin.${rule.origin}`)}
          </Badge>
          {rule.is_stale && (
            <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
              <Clock aria-hidden className="size-3" />
              {i18n.t("rules.row.stale")}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{i18n.t("rules.row.if")}</span>{" "}
          {conditions.join(" · ")} <span className="font-medium text-foreground/80">→</span>{" "}
          {actions.join(" · ")}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Link
          to={transactionsUrl({ rule: rule.id })}
          className="text-xs whitespace-nowrap text-muted-foreground hover:text-foreground hover:underline"
        >
          {i18n.t("rules.row.matches", { n: formatCount(rule.match_count) })}
        </Link>
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onEdit}
            aria-label={i18n.t("rules.row.edit", { name: rule.name })}
          >
            <Pencil aria-hidden />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            disabled={busy}
            aria-label={i18n.t("rules.row.delete", { name: rule.name })}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
        <Switch
          checked={rule.is_active}
          onChange={onToggle}
          disabled={busy}
          label={
            rule.is_active
              ? i18n.t("rules.row.deactivate", { name: rule.name })
              : i18n.t("rules.row.activate", { name: rule.name })
          }
        />
      </div>
    </li>
  );
}
