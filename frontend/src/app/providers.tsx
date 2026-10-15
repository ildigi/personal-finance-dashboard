import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { applyTheme, privacyStore, themeStore, watchSystemTheme } from "@/lib/preferences";

import { createQueryClient } from "./query-client";

export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());

  useEffect(() => {
    applyTheme(themeStore.get());
    privacyStore.set(privacyStore.get());
    return watchSystemTheme();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
