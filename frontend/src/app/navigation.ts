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

export interface NavItem {
  path: string;
  label: string;
  /** Etichetta breve per la barra in basso su telefono. */
  shortLabel?: string;
  icon: LucideIcon;
  description: string;
  /** Fase della roadmap in cui la pagina diventa operativa. */
  phase: number;
  /** Cosa mostrerà la pagina (SPEC §14). */
  planned: string[];
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      {
        path: "/",
        label: "Panoramica",
        shortLabel: "Home",
        icon: LayoutDashboard,
        description: "Quanto hai, quanto spendi, quanto rendi.",
        phase: 9,
        planned: [
          "Patrimonio netto e andamento a 12 mesi",
          "Spese del mese a confronto con il mese precedente",
          "Entrate, tasso di risparmio, valore del portafoglio",
          "Budget a rischio, prossimi addebiti, movimenti da classificare",
        ],
      },
    ],
  },
  {
    label: "Analisi",
    items: [
      {
        path: "/movimenti",
        label: "Movimenti",
        icon: ArrowLeftRight,
        description: "Tutti i movimenti di conti e carte, in un unico elenco.",
        phase: 4,
        planned: [
          "Tabella con ricerca, filtri salvabili e ordinamento",
          "Modifica di categoria, tipo, tag e note",
          "Dettaglio con dato originale e motivo della classificazione",
          "Inserimento manuale (es. carta di credito)",
        ],
      },
      {
        path: "/spese",
        label: "Spese",
        icon: ChartPie,
        description: "Dove vanno i soldi, per categoria e nel tempo.",
        phase: 5,
        planned: [
          "Spese reali del periodo, separate da “Spostati e investiti”",
          "Categorie e sottocategorie con drill-down fino ai movimenti",
          "Mese corrente contro mese precedente, trend 3/6/12 mesi",
          "Classifica dei merchant e abbonamenti",
        ],
      },
      {
        path: "/entrate",
        label: "Entrate",
        icon: Wallet,
        description: "Quanto entra, da dove, e quanto ne resta.",
        phase: 5,
        planned: [
          "Entrate per tipologia: stipendio, bonifici, rimborsi, cashback",
          "Entrate contro spese mese per mese",
          "Tasso di risparmio e medie a 3/6/12 mesi",
        ],
      },
    ],
  },
  {
    label: "Patrimonio",
    items: [
      {
        path: "/investimenti",
        label: "Investimenti",
        shortLabel: "Invest.",
        icon: TrendingUp,
        description: "Portafoglio Trading 212, solo in lettura.",
        phase: 7,
        planned: [
          "Valore attuale, capitale versato, P/L realizzato e non",
          "Rendimento % e XIRR",
          "Posizioni, ordini, dividendi, depositi e prelievi",
        ],
      },
      {
        path: "/patrimonio",
        label: "Patrimonio netto",
        shortLabel: "Patrimonio",
        icon: Landmark,
        description: "Conti e investimenti sommati, giorno per giorno.",
        phase: 9,
        planned: [
          "Patrimonio attuale e variazione mensile e annuale",
          "Andamento per conto",
          "Includi o escludi singoli conti",
        ],
      },
    ],
  },
  {
    label: "Pianificazione",
    items: [
      {
        path: "/budget",
        label: "Budget",
        icon: PiggyBank,
        description: "Limiti mensili solo dove servono.",
        phase: 6,
        planned: [
          "Speso contro budget con proiezione a fine mese",
          "Avvisi all'80% e al 100%",
          "Storico del rispetto dei budget",
        ],
      },
      {
        path: "/ricorrenze",
        label: "Ricorrenze",
        icon: Repeat,
        description: "Abbonamenti e movimenti periodici, con i prossimi addebiti.",
        phase: 6,
        planned: [
          "Abbonamenti, affitto e stipendio riconosciuti in automatico",
          "Conferma, correggi o rifiuta le proposte",
          "Prossimi addebiti e spesa ricorrente al mese",
        ],
      },
      {
        path: "/regole",
        label: "Regole",
        icon: Workflow,
        description: "Come i movimenti vengono classificati in automatico.",
        phase: 5,
        planned: [
          "Regole con priorità, condizioni e azioni",
          "Anteprima sui movimenti esistenti prima di salvare",
          "Regole imparate dalle tue correzioni",
        ],
      },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  path: "/impostazioni",
  label: "Impostazioni",
  icon: Settings,
  description: "Aspetto, privacy, categorie e connessioni.",
  phase: 3,
  planned: [],
};

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
