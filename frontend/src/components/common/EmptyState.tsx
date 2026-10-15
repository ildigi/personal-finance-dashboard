import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div className="relative mb-4">
        <div aria-hidden className="absolute inset-0 -m-3 rounded-full bg-primary/5" />
        <div className="relative flex size-12 items-center justify-center rounded-2xl bg-card text-primary shadow-card">
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && (
        <div className="mt-1.5 max-w-md text-sm text-pretty text-muted-foreground">{children}</div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
