import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";

import type { ThemePreference } from "@/lib/preferences";

export const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Chiaro", icon: Sun },
  { value: "dark", label: "Scuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];
