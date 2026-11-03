import {
  ArrowLeftRight,
  ChartPie,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  PiggyBank,
  Repeat,
  Settings,
  TrendingUp,
  Wallet,
  Workflow,
} from "lucide-react";

import { i18n } from "@/i18n";

/** Chiave della voce: etichetta, etichetta breve e descrizione stanno in `nav.items.<id>`. */
export type NavId =
  | "overview"
  | "transactions"
  | "expenses"
  | "income"
  | "investments"
  | "netWorth"
  | "budgets"
  | "recurring"
  | "rules"
  | "settings";

export interface NavItem {
  id: NavId;
  path: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: "analysis" | "wealth" | "planning" | null;
  items: NavItem[];
}

export const navLabel = (item: NavItem): string => i18n.t(`nav.items.${item.id}.label`);
/** Etichetta breve per la barra in basso su telefono. */
export const navShortLabel = (item: NavItem): string => i18n.t(`nav.items.${item.id}.short`);
export const navDescription = (item: NavItem): string => i18n.t(`nav.items.${item.id}.description`);

export const NAV_GROUPS: NavGroup[] = [
  {
    id: null,
    items: [{ id: "overview", path: "/", icon: LayoutDashboard }],
  },
  {
    id: "analysis",
    items: [
      { id: "transactions", path: "/movimenti", icon: ArrowLeftRight },
      { id: "expenses", path: "/spese", icon: ChartPie },
      { id: "income", path: "/entrate", icon: Wallet },
    ],
  },
  {
    id: "wealth",
    items: [
      { id: "investments", path: "/investimenti", icon: TrendingUp },
      { id: "netWorth", path: "/patrimonio", icon: Landmark },
    ],
  },
  {
    id: "planning",
    items: [
      { id: "budgets", path: "/budget", icon: PiggyBank },
      { id: "recurring", path: "/ricorrenze", icon: Repeat },
      { id: "rules", path: "/regole", icon: Workflow },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { id: "settings", path: "/impostazioni", icon: Settings };

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];

/** Voci fisse della barra in basso su telefono; le altre stanno in "Altro". */
export const MOBILE_PRIMARY_PATHS = ["/", "/movimenti", "/spese", "/investimenti"];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === "/") return ALL_NAV_ITEMS[0];
  return ALL_NAV_ITEMS.find((item) => item.path !== "/" && pathname.startsWith(item.path));
}

/** Fase della roadmap attualmente in corso (oltre l'ultima = tutte completate). */
export const CURRENT_PHASE = 11;

export const ROADMAP: { phase: number; title: string }[] = [
  { phase: 0, title: "Pianificazione e ambiente" },
  { phase: 1, title: "Struttura e repository" },
  { phase: 2, title: "Backend e database" },
  { phase: 3, title: "Interfaccia di base" },
  { phase: 4, title: "Dati di prova e importazione" },
  { phase: 5, title: "Classificazione, spese ed entrate" },
  { phase: 6, title: "Budget e ricorrenze" },
  { phase: 7, title: "Trading 212" },
  { phase: 8, title: "Open Banking: CA e Revolut" },
  { phase: 9, title: "Patrimonio e panoramica" },
  { phase: 10, title: "Sicurezza e deploy" },
];
