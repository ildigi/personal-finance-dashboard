import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

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
import {
  browserLanguage,
  LANGUAGE_NAMES,
  LANGUAGES,
  type LanguagePreference,
} from "@/i18n/languages";
import { formatMoney } from "@/lib/format";
import { useLanguagePreference, usePrivacy, useTheme } from "@/lib/preferences";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  const lookups = useLookups();
  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
      <div className="space-y-4 lg:space-y-6">
        <AppearanceCard />
        <LanguageCard />
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

const optionClass = (selected: boolean): string =>
  cn(
    "flex flex-col items-center justify-center gap-2 rounded-xl border text-sm transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    selected
      ? "border-primary bg-primary/5 font-medium text-primary"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );

function AppearanceCard() {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.appearance.title")}</CardTitle>
        <CardDescription>{t("settings.appearance.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label={t("theme.label")} className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => {
                setTheme(value);
              }}
              className={cn("min-h-20", optionClass(theme === value))}
            >
              <Icon aria-hidden className="size-5" />
              {t(`theme.${value}`)}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const LANGUAGE_OPTIONS: LanguagePreference[] = ["auto", ...LANGUAGES];

/** Lingua dell'interfaccia: automatica (come il browser), inglese o italiano. */
function LanguageCard() {
  const { t } = useTranslation();
  const [preference, setPreference] = useLanguagePreference();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.language.title")}</CardTitle>
        <CardDescription>{t("settings.language.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div
          role="radiogroup"
          aria-label={t("settings.language.label")}
          className="flex flex-wrap gap-2"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={preference === option}
              // Il nome della lingua nella lingua stessa: chi non legge quella attuale la ritrova.
              lang={option === "auto" ? undefined : option}
              onClick={() => {
                setPreference(option);
              }}
              className={cn("min-h-11 flex-1 px-3", optionClass(preference === option))}
            >
              {option === "auto" ? t("settings.language.auto") : LANGUAGE_NAMES[option]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("settings.language.autoHint", { language: LANGUAGE_NAMES[browserLanguage()] })}
        </p>
      </CardContent>
    </Card>
  );
}

function PrivacyCard() {
  const { t } = useTranslation();
  const [privacy, setPrivacy] = usePrivacy();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.privacy.title")}</CardTitle>
        <CardDescription>{t("settings.privacy.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span className="text-sm">
            <span className="font-medium">{t("settings.privacy.hide")}</span>
            <span className="block text-xs text-muted-foreground">
              <Trans
                i18nKey="settings.privacy.hint"
                components={{ kbd: <kbd className="rounded border px-1 text-[10px]" /> }}
              />
            </span>
          </span>
          <Switch checked={privacy} onChange={setPrivacy} label={t("common.privacyMode")} />
        </label>
        <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Lock aria-hidden className="size-3.5 shrink-0" />
          {t("settings.privacy.example")}{" "}
          <span data-sensitive className="font-medium text-foreground">
            {formatMoney("1234.56")}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

function IncomeTypesCard() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useIncomeTypes();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.incomeTypes.title")}</CardTitle>
        <CardDescription>{t("settings.incomeTypes.description")}</CardDescription>
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
  const { t } = useTranslation();
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
      <p className="py-6 text-center text-sm text-muted-foreground">{t("common.backendDown")}</p>
    );
  }
  return <>{children}</>;
}
