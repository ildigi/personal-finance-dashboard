import { CalendarDays, Eye, EyeOff, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatRange,
  isPeriodPreset,
  PERIOD_PRESETS,
  periodLabel,
  periodShortLabel,
  resolvePeriod,
} from "@/lib/period";
import { usePeriod, usePrivacy, useTheme } from "@/lib/preferences";
import { cn } from "@/lib/utils";

import { THEME_OPTIONS } from "./theme-options";

export function PeriodPicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [period, setPeriod] = usePeriod();
  const range = resolvePeriod(period);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 gap-2 bg-card px-2.5 sm:px-3", className)}
          aria-label={t("period.ariaLabel", {
            label: periodLabel(period),
            range: formatRange(range),
          })}
        >
          <CalendarDays aria-hidden className="text-muted-foreground" />
          <span className="font-medium sm:hidden">{periodShortLabel(period)}</span>
          <span className="hidden font-medium sm:inline">{periodLabel(period)}</span>
          <span className="hidden text-muted-foreground xl:inline">{formatRange(range)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t("period.heading")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={period}
          onValueChange={(value) => {
            if (isPeriodPreset(value)) setPeriod(value);
          }}
        >
          {PERIOD_PRESETS.map((preset) => (
            <DropdownMenuRadioItem key={preset} value={preset} className="py-2">
              <span className="flex w-full items-baseline justify-between gap-3">
                <span>{periodLabel(preset)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatRange(resolvePeriod(preset))}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("period.note")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PrivacyToggle() {
  const { t } = useTranslation();
  const [privacy, setPrivacy] = usePrivacy();
  const label = privacy ? t("toolbar.showAmounts") : t("toolbar.hideAmounts");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={privacy}
          aria-label={label}
          onClick={() => {
            setPrivacy(!privacy);
          }}
          className={cn(privacy && "bg-accent text-primary")}
        >
          {privacy ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} <kbd className="ml-1 rounded border border-current/30 px-1 text-[10px]">P</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

export function ThemeMenu() {
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("theme.label")}>
          <Sun aria-hidden className="dark:hidden" />
          <Moon aria-hidden className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          {t("theme.label")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            const option = THEME_OPTIONS.find((o) => o.value === value);
            if (option) setTheme(option.value);
          }}
        >
          {THEME_OPTIONS.map(({ value, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2">
              <Icon aria-hidden className="text-muted-foreground" />
              {t(`theme.${value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
