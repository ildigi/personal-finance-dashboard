import { CircleDashed, Sparkles } from "lucide-react";

import { CURRENT_PHASE, ROADMAP, type NavItem } from "@/app/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** Pagina non ancora operativa: spiega cosa conterrà e in quale fase arriva. */
export function PlannedPage({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const phase = ROADMAP.find((step) => step.phase === item.phase);
  const phasesAway = item.phase - CURRENT_PHASE;

  return (
    <Card className="overflow-hidden py-0">
      <div className="relative border-b bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-card text-primary shadow-card">
            <Icon aria-hidden className="size-6" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{item.label}</h2>
              <Badge variant="secondary" className="gap-1">
                <Sparkles aria-hidden className="size-3" />
                Fase {item.phase}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </div>
        </div>
      </div>
      <CardContent className="grid gap-6 px-5 py-6 sm:px-8 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <h3 className="text-sm font-medium">Cosa troverai qui</h3>
          <ul className="mt-3 space-y-2.5">
            {item.planned.map((feature) => (
              <li key={feature} className="flex gap-3 text-sm text-muted-foreground">
                <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-primary/70" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm md:w-64">
          <div className="text-xs text-muted-foreground">Arriva con</div>
          <div className="mt-0.5 font-medium">
            Fase {item.phase}
            {phase && ` · ${phase.title}`}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {phasesAway <= 1 ? "È la prossima fase." : `Tra ${String(phasesAway)} fasi.`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
