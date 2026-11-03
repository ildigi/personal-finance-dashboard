import "@/i18n";

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { TooltipProvider } from "@/components/ui/tooltip";
import { applyTheme, privacyStore, themeStore, watchSystemTheme } from "@/lib/preferences";

import { createQueryClient } from "./query-client";

/**
 * Al cambio di lingua l'app si rimonta: anche importi e date formattati fuori da `t()`
 * passano alla nuova locale. I dati già scaricati restano nella cache delle query.
 */
function LanguageBoundary({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  return <Fragment key={i18n.resolvedLanguage}>{children}</Fragment>;
}

export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());

  useEffect(() => {
    applyTheme(themeStore.get());
    privacyStore.set(privacyStore.get());
    return watchSystemTheme();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <LanguageBoundary>{children}</LanguageBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
