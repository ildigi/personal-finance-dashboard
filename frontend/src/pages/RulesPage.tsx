import { CircleDashed, Link2, ListChecks, Plus, RefreshCw, Sparkles, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

import { EmptyState } from "@/components/common/EmptyState";
import { StatTile } from "@/components/common/StatTile";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMerchantNames } from "@/features/merchants/queries";
import { RuleEditorSheet, type RuleDraft } from "@/features/rules/components/RuleEditorSheet";
import { RuleRow } from "@/features/rules/components/RuleRow";
import { TransferSuggestionsCard } from "@/features/rules/components/TransferSuggestionsCard";
import {
  useClassificationStats,
  useDeleteRule,
  useReorderRules,
  useRules,
  useRunClassification,
  useToggleRule,
  useTransferSuggestions,
  type Rule,
} from "@/features/rules/queries";
import { transactionsUrl } from "@/features/transactions/filters";
import { useLookups } from "@/features/transactions/lookups";
import { useTransaction, type TransactionDetail } from "@/features/transactions/queries";
import { formatCount, formatPercent } from "@/lib/format";
import { i18n } from "@/i18n";

/** Bozza di regola a partire da un movimento ("crea regola da qui"). */
function draftFromTransaction(tx: TransactionDetail): RuleDraft {
  const out = tx.amount_eur.startsWith("-");
  const subject = tx.merchant_name ?? tx.description_clean;
  return {
    id: null,
    name: subject,
    merchantName: tx.merchant_name ?? undefined,
    conditions: {
      ...(tx.merchant_id !== null
        ? { merchant_id: tx.merchant_id }
        : { description_contains: tx.description_clean.toLowerCase() }),
      direction: out ? "out" : "in",
    },
    actions: {
      ...(tx.category_id !== null && {
        category_id: tx.category_id,
        subcategory_id: tx.subcategory_id,
      }),
      ...(tx.kind === "income" &&
        tx.income_type_id !== null && { income_type_id: tx.income_type_id }),
    },
  };
}

export function RulesPage() {
  const lookups = useLookups();
  const merchantNames = useMerchantNames();
  const rules = useRules();
  const stats = useClassificationStats();
  const suggestions = useTransferSuggestions();
  const toggle = useToggleRule();
  const remove = useDeleteRule();
  const reorder = useReorderRules();
  const run = useRunClassification();
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();

  // "Crea una regola da questo movimento" arriva con ?da=<id>.
  const fromId = Number(params.get("da")) || null;
  const source = useTransaction(fromId);
  const [handledSource, setHandledSource] = useState<number | null>(null);
  if (source.data && source.data.id !== handledSource) {
    setHandledSource(source.data.id);
    setDraft(draftFromTransaction(source.data));
  }

  const highlightedId = hash.startsWith("#regola-") ? Number(hash.slice(8)) : null;
  useEffect(() => {
    if (highlightedId && rules.data) {
      document
        .getElementById(`regola-${String(highlightedId)}`)
        ?.scrollIntoView({ block: "center" });
    }
  }, [highlightedId, rules.data]);

  const all = rules.data ?? [];
  const mine = all.filter((r) => r.origin !== "seed");
  const system = all.filter((r) => r.origin === "seed");
  const busy = toggle.isPending || remove.isPending || reorder.isPending;

  function move(rule: Rule, direction: -1 | 1): void {
    const ids = mine.map((r) => r.id);
    const index = ids.indexOf(rule.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] ?? rule.id, rule.id];
    reorder.mutate(ids);
  }

  function edit(rule: Rule): void {
    setDraft({
      id: rule.id,
      name: rule.name,
      conditions: rule.conditions,
      actions: rule.actions,
      merchantName:
        rule.conditions.merchant_id != null
          ? merchantNames.get(rule.conditions.merchant_id)
          : undefined,
    });
  }

  const row = (rule: Rule, index: number, list: Rule[], editable: boolean) => (
    <RuleRow
      key={rule.id}
      rule={rule}
      lookups={lookups}
      merchantNames={merchantNames}
      highlighted={rule.id === highlightedId}
      busy={busy}
      onToggle={(active) => {
        toggle.mutate({ id: rule.id, active });
      }}
      {...(editable && {
        onEdit: () => {
          edit(rule);
        },
        onDelete: () => {
          if (window.confirm(i18n.t("rules.deleteConfirm", { name: rule.name }))) {
            remove.mutate(rule.id);
          }
        },
        onMove: (direction: -1 | 1) => {
          move(rule, direction);
        },
        canMoveUp: index > 0,
        canMoveDown: index < list.length - 1,
      })}
    />
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{i18n.t("rules.intro")}</p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            disabled={run.isPending}
            onClick={() => {
              run.mutate();
            }}
          >
            <RefreshCw aria-hidden className={run.isPending ? "animate-spin" : undefined} />
            {i18n.t("rules.reclassify")}
          </Button>
          <Button
            onClick={() => {
              setDraft({ id: null, name: "", conditions: {}, actions: {} });
            }}
          >
            <Plus aria-hidden />
            {i18n.t("rules.new")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label={i18n.t("rules.tiles.active")}
          icon={ListChecks}
          value={stats.data ? formatCount(stats.data.active_rules) : undefined}
          delta={
            stats.data && stats.data.stale_rules > 0
              ? i18n.t("rules.tiles.stale", { n: formatCount(stats.data.stale_rules) })
              : i18n.t("rules.tiles.allInUse")
          }
        />
        <StatTile
          label={i18n.t("rules.tiles.auto")}
          icon={Sparkles}
          value={stats.data ? formatPercent(stats.data.auto_pct / 100) : undefined}
          delta={
            stats.data
              ? i18n.t("rules.tiles.autoDetail", {
                  auto: formatCount(stats.data.auto_classified),
                  total: formatCount(stats.data.total),
                  manual: formatCount(stats.data.manual),
                })
              : undefined
          }
        />
        <StatTile
          label={i18n.t("rules.tiles.unclassified")}
          icon={CircleDashed}
          value={stats.data ? formatCount(stats.data.unclassified) : undefined}
          delta={
            stats.data && stats.data.unclassified > 0 ? (
              <Link
                to={transactionsUrl({ uncategorized: true })}
                className="text-primary hover:underline"
              >
                {i18n.t("rules.tiles.seeTransactions")}
              </Link>
            ) : (
              i18n.t("rules.tiles.noneGreat")
            )
          }
        />
        <StatTile
          label={i18n.t("rules.tiles.transfers")}
          icon={Link2}
          value={suggestions.data ? formatCount(suggestions.data.length) : undefined}
          delta={i18n.t("rules.tiles.transfersNote")}
        />
      </div>

      {suggestions.data && (
        <TransferSuggestionsCard suggestions={suggestions.data} lookups={lookups} />
      )}

      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>{i18n.t("rules.mine.title")}</CardTitle>
          <CardDescription>{i18n.t("rules.mine.description")}</CardDescription>
        </CardHeader>
        {rules.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : mine.length === 0 ? (
          <EmptyState icon={Workflow} title={i18n.t("rules.mine.emptyTitle")}>
            {i18n.t("rules.mine.empty")}
          </EmptyState>
        ) : (
          <ul className="divide-y">{mine.map((r, i, list) => row(r, i, list, true))}</ul>
        )}
      </Card>

      <Card className="gap-0 overflow-hidden pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>{i18n.t("rules.system.title")}</CardTitle>
          <CardDescription>{i18n.t("rules.system.description")}</CardDescription>
        </CardHeader>
        {rules.isPending ? (
          <div className="p-5">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <ul className="divide-y">{system.map((r, i, list) => row(r, i, list, false))}</ul>
        )}
      </Card>

      <RuleEditorSheet
        draft={draft}
        lookups={lookups}
        onClose={() => {
          setDraft(null);
          if (params.has("da")) {
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.delete("da");
                return next;
              },
              { replace: true },
            );
          }
        }}
      />
    </div>
  );
}
