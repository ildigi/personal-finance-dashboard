import type { NavBadge } from "@/app/nav-badges";
import { cn } from "@/lib/utils";

export function NavBadgePill({ badge, className }: { badge: NavBadge; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        badge.tone === "alert" ? "bg-status-critical text-white" : "bg-primary/15 text-primary",
        className,
      )}
    >
      <span aria-hidden>{badge.count}</span>
      <span className="sr-only">{badge.label}</span>
    </span>
  );
}
