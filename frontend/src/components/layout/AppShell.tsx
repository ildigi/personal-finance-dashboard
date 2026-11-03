import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router";

import { findNavItem, navDescription, navLabel } from "@/app/navigation";
import { BrandMark } from "@/components/common/BrandMark";
import { privacyStore } from "@/lib/preferences";

import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { PeriodPicker, PrivacyToggle, ThemeMenu } from "./Toolbar";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Scorciatoia "P": attiva/disattiva la modalità privacy (fuori dai campi di testo). */
function usePrivacyShortcut(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== "p" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      privacyStore.set(!privacyStore.get());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

export function AppShell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  usePrivacyShortcut();

  useEffect(() => {
    const app = t("common.appName");
    document.title = item ? t("common.documentTitle", { page: navLabel(item), app }) : app;
    window.scrollTo({ top: 0 });
  }, [item, t]);

  return (
    <div className="min-h-dvh">
      <a
        href="#contenuto"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("common.skipToContent")}
      </a>
      <Sidebar />

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-lg">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <BrandMark className="size-7 lg:hidden" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {item ? navLabel(item) : t("common.pageNotFound")}
              </h1>
              {item && (
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  {navDescription(item)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <PeriodPicker />
              <PrivacyToggle />
              <div className="hidden lg:block">
                <ThemeMenu />
              </div>
            </div>
          </div>
        </header>

        <main
          id="contenuto"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-8 lg:pt-8 lg:pb-12"
        >
          <Outlet />
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
