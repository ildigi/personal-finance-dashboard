import { Check, Sparkles } from "lucide-react";
import { useState } from "react";

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
          const count = `${formatCount(result.updated)} ${result.updated === 1 ? "movimento aggiornato" : "movimenti aggiornati"}`;
          setDone(
            result.rule
              ? `Regola creata: «${result.rule.name}». ${count}; varrà anche per i prossimi.`
              : `${count}.`,
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
          Applicare <strong className="font-medium">{target}</strong> a tutti i movimenti di{" "}
          <strong className="font-medium">{data.subject}</strong>
          {similar > 0
            ? ` (${formatCount(similar)} ${similar === 1 ? "passato" : "passati"}, e quelli futuri)?`
            : " in arrivo?"}
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
          Solo questo
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
            Anche i passati
          </Button>
        )}
        <Button
          size="sm"
          disabled={learn.isPending}
          onClick={() => {
            run("rule");
          }}
        >
          Crea regola per il futuro
        </Button>
      </div>
      {learn.isError && (
        <p className="text-xs text-destructive">
          {learn.error instanceof ApiError ? learn.error.message : "Operazione non riuscita"}
        </p>
      )}
    </div>
  );
}
