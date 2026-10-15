import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Source } from "@/features/sync/queries";

import { useDisconnectBank } from "./queries";

/**
 * «Scollega»: revoca il consenso presso la banca. Si sceglie se tenere i movimenti già
 * scaricati (con le tue correzioni) o eliminarli insieme ai conti.
 */
export function DisconnectBank({ source }: { source: Source }) {
  const [confirming, setConfirming] = useState(false);
  const disconnect = useDisconnectBank();
  if (source.provider !== "enablebanking" || source.status === "disabled") return null;

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-muted-foreground"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Scollega
      </Button>
    );
  }
  const run = (deleteData: boolean) => {
    disconnect.mutate({ sourceId: source.id, deleteData });
  };
  return (
    <span
      role="group"
      aria-label={`Scollega ${source.display_name}`}
      className="flex basis-full flex-wrap items-center gap-2 pt-1"
    >
      <span className="text-foreground">Scollegare {source.display_name}?</span>
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={disconnect.isPending}
        onClick={() => {
          run(false);
        }}
      >
        Tieni i movimenti
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className="h-7"
        disabled={disconnect.isPending}
        onClick={() => {
          run(true);
        }}
      >
        Elimina conti e movimenti
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7"
        onClick={() => {
          setConfirming(false);
        }}
      >
        Annulla
      </Button>
      {disconnect.isError && <span className="text-destructive">{disconnect.error.message}</span>}
    </span>
  );
}
