import { CalendarClock, PiggyBank } from "lucide-react";
import { Link } from "react-router";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UpcomingList } from "@/features/recurring/components/UpcomingList";
import { useUpcoming } from "@/features/recurring/queries";
import { useLookups } from "@/features/transactions/lookups";
import { formatCount } from "@/lib/format";

import { useBudgets } from "../queries";
import { BudgetMiniList } from "./BudgetMiniList";

function MoreLink({ to, children }: { to: string; children: string }) {
  return (
    <CardAction>
      <Link to={to} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
        {children}
      </Link>
    </CardAction>
  );
}

/** Panoramica: i budget del mese, i più a rischio per primi. */
export function BudgetOverviewCard({ className }: { className?: string }) {
  const budgets = useBudgets();
  const data = budgets.data;
  const alerts = data ? data.warning_count + data.over_count : 0;
  const atRisk = data ? data.items.filter((i) => i.level === "ok" && i.projected_over).length : 0;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PiggyBank aria-hidden className="size-4 text-muted-foreground" />
          Budget del mese
        </CardTitle>
        <CardDescription>
          {!data
            ? "Speso contro budget"
            : alerts > 0
              ? `${formatCount(alerts)} oltre la soglia di avviso`
              : atRisk > 0
                ? `Sotto le soglie, ma ${formatCount(atRisk)} a rischio a fine mese`
                : data.items.length > 0
                  ? "Tutto sotto le soglie"
                  : "Nessun budget impostato"}
        </CardDescription>
        <MoreLink to="/budget">Budget</MoreLink>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton className="h-32 w-full" />
        ) : data.items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Imposta un limite mensile solo sulle categorie che vuoi tenere d'occhio.{" "}
            <Link to="/budget" className="text-foreground underline-offset-4 hover:underline">
              Crea un budget
            </Link>
          </p>
        ) : (
          <BudgetMiniList items={data.items} />
        )}
      </CardContent>
    </Card>
  );
}

/** Panoramica: prossimi addebiti ricorrenti (confermati). */
export function UpcomingChargesCard({ className }: { className?: string }) {
  const lookups = useLookups();
  const upcoming = useUpcoming({ days: 14, direction: "out" });
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
          Prossimi addebiti
        </CardTitle>
        <CardDescription>Ricorrenze confermate, prossimi 14 giorni</CardDescription>
        <MoreLink to="/ricorrenze">Ricorrenze</MoreLink>
      </CardHeader>
      <CardContent>
        {upcoming.data ? (
          <UpcomingList
            items={upcoming.data}
            lookups={lookups}
            limit={6}
            emptyText="Nessun addebito confermato in arrivo"
          />
        ) : (
          <Skeleton className="h-32 w-full" />
        )}
      </CardContent>
    </Card>
  );
}
