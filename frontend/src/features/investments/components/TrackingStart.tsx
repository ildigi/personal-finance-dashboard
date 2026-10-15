import { CalendarRange } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { todayInRome } from "@/lib/period";

import { useUpdateTrackingStart } from "../queries";

/** "dal 1 set 2026" oppure "tutto lo storico": apre il pannello per cambiarla. */
export function TrackingStartButton({
  start,
  open,
  onToggle,
}: {
  start: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-muted-foreground"
      aria-expanded={open}
      aria-controls="tracking-start-panel"
      onClick={onToggle}
    >
      <CalendarRange aria-hidden className="size-3.5" />
      {start ? `dal ${formatDate(start)}` : "tutto lo storico"}
    </Button>
  );
}

/**
 * Data di inizio dei rendimenti: quello che è successo prima (es. vecchie azioni già vendute)
 * non conta; il saldo a quella data diventa il capitale di partenza.
 */
export function TrackingStartPanel({
  portfolioId,
  start,
  onClose,
}: {
  portfolioId: number;
  start: string | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState(start ?? "");
  const update = useUpdateTrackingStart(portfolioId);
  const today = todayInRome();
  const save = (next: string | null) => {
    update.mutate(next, { onSuccess: onClose });
  };

  return (
    <Card id="tracking-start-panel" className="gap-3 px-4 py-4 sm:px-5">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Da quando contare i rendimenti</h2>
        <p className="text-xs text-muted-foreground">
          Versamenti, ordini, dividendi e guadagni realizzati prima di questa data non contano.
          Quello che c'era sul conto quel giorno vale come capitale di partenza.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) save(value);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="tracking-start" className="text-xs text-muted-foreground">
            Data di inizio
          </Label>
          <Input
            id="tracking-start"
            type="date"
            className="w-44"
            value={value}
            max={today}
            onChange={(e) => {
              setValue(e.target.value);
            }}
          />
        </div>
        <Button type="submit" size="sm" disabled={!value || value > today || update.isPending}>
          Salva
        </Button>
        {start && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={update.isPending}
            onClick={() => {
              save(null);
            }}
          >
            Usa tutto lo storico
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Annulla
        </Button>
      </form>
      {update.isError && <p className="text-xs text-destructive">{update.error.message}</p>}
    </Card>
  );
}
