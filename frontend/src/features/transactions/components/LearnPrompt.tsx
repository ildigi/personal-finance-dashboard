import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";

import { useLearn, useLearnSuggestion } from "../queries";

/**
 * Dopo una correzione (SPEC §11, "Apprendimento tramite regole"):
 * "Applicare 'Abbonamenti › AI' a tutti i movimenti di OpenAI (12 passati, e quelli futuri)?"
 * Tre scelte: solo questo / anche i passati / crea regola per il futuro.
 */
export function LearnPrompt({ transactionId }: { transactionId: number }) {
  const { t } = useTranslation();
  const suggestion = useLearnSuggestion(transactionId, true);
  const learn = useLearn();
  const [done, setDone] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const data = suggestion.data;

  if (dismissed || !data) return null;
  const target = data.rule_name.split(" → ").slice(1).join(" → ");

  if (done) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground"
      >
        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
        {done}
      </p>
    );
  }

  function run(scope: "past" | "rule"): void {
    learn.mutate(
      { id: transactionId, scope },
      {
        onSuccess: (result) => {
          const updated = t("transactions.learn.updated", {
            count: result.updated,
            n: formatCount(result.updated),
          });
          setDone(
            result.rule
              ? t("transactions.learn.ruleCreated", { name: result.rule.name, updated })
              : t("transactions.learn.done", { updated }),
          );
        },
      },
    );
  }

  const similar = data.similar_count;
  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-start gap-2 text-sm">
        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          {similar > 0 ? (
            <Trans
              i18nKey="transactions.learn.question"
              count={similar}
              values={{ target, subject: data.subject, n: formatCount(similar) }}
              components={{ strong: <strong className="font-medium" /> }}
            />
          ) : (
            <Trans
              i18nKey="transactions.learn.questionFuture"
              values={{ target, subject: data.subject }}
              components={{ strong: <strong className="font-medium" /> }}
            />
          )}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDismissed(true);
          }}
        >
          {t("transactions.learn.onlyThis")}
        </Button>
        {similar > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={learn.isPending}
            onClick={() => {
              run("past");
            }}
          >
            {t("transactions.learn.past")}
          </Button>
        )}
        <Button
          size="sm"
          disabled={learn.isPending}
          onClick={() => {
            run("rule");
          }}
        >
          {t("transactions.learn.rule")}
        </Button>
      </div>
      {learn.isError && (
        <p className="text-xs text-destructive">
          {learn.error instanceof ApiError ? learn.error.message : t("transactions.learn.failed")}
        </p>
      )}
    </div>
  );
}
