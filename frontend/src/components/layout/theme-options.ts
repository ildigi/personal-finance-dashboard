import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";

import type { ThemePreference } from "@/lib/preferences";

/** Etichette in `theme.<value>`. */
export const THEME_OPTIONS: { value: ThemePreference; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];
