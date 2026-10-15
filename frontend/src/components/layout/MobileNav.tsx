import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router";

import { useNavBadges } from "@/app/nav-badges";
import { ALL_NAV_ITEMS, MOBILE_PRIMARY_PATHS, type NavItem } from "@/app/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/common/Switch";
import { usePrivacy, useTheme } from "@/lib/preferences";
import { cn } from "@/lib/utils";

import { NavBadgePill } from "./NavBadgePill";
import { THEME_OPTIONS } from "./theme-options";

const primaryItems = MOBILE_PRIMARY_PATHS.map((path) =>
  ALL_NAV_ITEMS.find((item) => item.path === path),
).filter((item): item is NavItem => item !== undefined);

const moreItems = ALL_NAV_ITEMS.filter((item) => !MOBILE_PRIMARY_PATHS.includes(item.path));

const tabClass = (active: boolean): string =>
  cn(
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
    "focus-visible:bg-accent focus-visible:outline-none",
    active ? "text-primary" : "text-muted-foreground",
  );

function TabIcon({ icon: Icon, active }: { icon: NavItem["icon"]; active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
        active && "bg-primary/10",
      )}
    >
      <Icon aria-hidden className="size-5" />
    </span>
  );
}

/** Barra di navigazione in basso, solo su schermi stretti. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const moreActive = moreItems.some((item) => pathname.startsWith(item.path));
  const badges = useNavBadges();
  const moreBadges = moreItems.flatMap((item) => badges.get(item.path) ?? []);
  const moreBadge = moreBadges.length > 0;
  const moreAlert = moreBadges.some((b) => b.tone === "alert");

  return (
    <nav
      aria-label="Navigazione rapida"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 backdrop-blur-lg lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {primaryItems.map((item) => (
          <li key={item.path} className="flex flex-1">
            <NavLink
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) => tabClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  <TabIcon icon={item.icon} active={isActive} />
                  {item.shortLabel ?? item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li className="flex flex-1">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className={tabClass(moreActive)} aria-label="Altre pagine e preferenze">
              <span className="relative">
                <TabIcon icon={Ellipsis} active={moreActive} />
                {moreBadge && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-0.5 right-2 size-2 rounded-full ring-2 ring-card",
                      moreAlert ? "bg-status-critical" : "bg-primary",
                    )}
                  />
                )}
              </span>
              Altro
            </SheetTrigger>
            <SheetContent side="bottom" className="pb-safe gap-0 rounded-t-2xl bg-card">
              <SheetHeader className="pb-2">
                <SheetTitle>Altro</SheetTitle>
                <SheetDescription className="sr-only">Altre pagine e preferenze</SheetDescription>
              </SheetHeader>
              <MoreSheetBody
                onNavigate={() => {
                  setOpen(false);
                }}
              />
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}

function MoreSheetBody({ onNavigate }: { onNavigate: () => void }) {
  const [theme, setTheme] = useTheme();
  const badges = useNavBadges();
  const [privacy, setPrivacy] = usePrivacy();

  return (
    <div className="space-y-5 px-4 pb-5">
      <ul className="grid grid-cols-3 gap-2">
        {moreItems.map((item) => {
          const Icon = item.icon;
          const badge = badges.get(item.path);
          return (
            <li key={item.path} className="relative">
              <NavLink
                to={item.path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl px-2 text-center text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "bg-background text-foreground active:bg-accent",
                  )
                }
              >
                <Icon aria-hidden className="size-5" />
                {item.shortLabel ?? item.label}
                {badge && <NavBadgePill badge={badge} className="absolute top-2 right-2" />}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Tema</div>
        <div
          role="radiogroup"
          aria-label="Tema"
          className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1"
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => {
                setTheme(value);
              }}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors",
                theme === value ? "bg-card font-medium shadow-card" : "text-muted-foreground",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-background px-4 py-2">
        <span className="text-sm">
          <span className="font-medium">Modalità privacy</span>
          <span className="block text-xs text-muted-foreground">
            Oscura importi e dati sensibili
          </span>
        </span>
        <Switch checked={privacy} onChange={setPrivacy} label="Modalità privacy" />
      </div>
    </div>
  );
}
