import { CircleAlert, CircleCheck, CircleX, LoaderCircle, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type Status = "good" | "warning" | "critical" | "pending" | "unknown";

const CONFIG = {
  good: { icon: CircleCheck, className: "text-status-good" },
  warning: { icon: TriangleAlert, className: "text-status-warning" },
  critical: { icon: CircleX, className: "text-status-critical" },
  pending: { icon: LoaderCircle, className: "animate-spin text-muted-foreground" },
  unknown: { icon: CircleAlert, className: "text-muted-foreground" },
} as const;

/** Stato con icona + etichetta: il colore non porta mai da solo il significato. */
export function StatusIndicator({
  status,
  label,
  className,
}: {
  status: Status;
  label: string;
  className?: string;
}) {
  const { icon: Icon, className: iconClass } = CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <Icon aria-hidden className={cn("size-4 shrink-0", iconClass)} />
      <span>{label}</span>
    </span>
  );
}

/** Pallino di stato compatto, sempre accompagnato da testo visibile o leggibile. */
export function StatusDot({ status }: { status: Status }) {
  return (
    <span className="relative flex size-2.5" aria-hidden>
      {status === "good" && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-good opacity-40 motion-reduce:hidden" />
      )}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          status === "good" && "bg-status-good",
          status === "warning" && "bg-status-warning",
          status === "critical" && "bg-status-critical",
          (status === "pending" || status === "unknown") && "bg-muted-foreground/50",
        )}
      />
    </span>
  );
}
