import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { Switch } from "@/components/common/Switch";
import { THEME_OPTIONS } from "@/components/layout/theme-options";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoriesManager } from "@/features/categories/CategoriesManager";
import { MerchantsCard } from "@/features/merchants/MerchantsCard";
import { AccessCard } from "@/features/auth/AccessCard";
import { ConnectionsCard } from "@/features/sync/ConnectionsCard";
import { useIncomeTypes } from "@/features/system/queries";
import { useLookups } from "@/features/transactions/lookups";
import { usePrivacy, useTheme } from "@/lib/preferences";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  const lookups = useLookups();
  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
      <div className="space-y-4 lg:space-y-6">
        <AppearanceCard />
        <PrivacyCard />
        <AccessCard />
        <ConnectionsCard />
      </div>
      <div className="space-y-4 lg:col-span-2 lg:space-y-6">
        <CategoriesManager />
        <MerchantsCard lookups={lookups} />
        <IncomeTypesCard />
      </div>
    </div>
  );
}

function AppearanceCard() {
  const [theme, setTheme] = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aspetto</CardTitle>
        <CardDescription>Tema chiaro, scuro o uguale al sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
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
                "flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-sm transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                theme === value
                  ? "border-primary bg-primary/5 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PrivacyCard() {
  const [privacy, setPrivacy] = usePrivacy();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy</CardTitle>
        <CardDescription>Per quando qualcuno guarda lo schermo</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span className="text-sm">
            <span className="font-medium">Oscura importi e IBAN</span>
            <span className="block text-xs text-muted-foreground">
              Passa il mouse su un valore per vederlo. Scorciatoia: tasto{" "}
              <kbd className="rounded border px-1 text-[10px]">P</kbd>
            </span>
          </span>
          <Switch checked={privacy} onChange={setPrivacy} label="Modalità privacy" />
        </label>
        <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Lock aria-hidden className="size-3.5 shrink-0" />
          Esempio:{" "}
          <span data-sensitive className="font-medium text-foreground">
            1.234,56 €
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

function IncomeTypesCard() {
  const { data, isPending, isError } = useIncomeTypes();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tipologie di entrata</CardTitle>
        <CardDescription>Usate per classificare le entrate</CardDescription>
      </CardHeader>
      <CardContent>
        <ListState isPending={isPending} isError={isError} rows={2}>
          <ul className="flex flex-wrap gap-2">
            {data?.map((type) => (
              <li key={type.id}>
                <Badge variant="outline" className="px-2.5 py-1 text-sm font-normal">
                  {type.label}
                </Badge>
              </li>
            ))}
          </ul>
        </ListState>
      </CardContent>
    </Card>
  );
}

function ListState({
  isPending,
  isError,
  rows,
  children,
}: {
  isPending: boolean;
  isError: boolean;
  rows: number;
  children: ReactNode;
}) {
  if (isPending) {
    return (
      <div className="grid gap-2 sm:grid-cols-2" aria-busy>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Dati non disponibili: il backend non risponde.
      </p>
    );
  }
  return <>{children}</>;
}
