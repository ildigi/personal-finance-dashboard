import { createBrowserRouter, type RouteObject } from "react-router";

import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/features/auth/AuthGate";

import { ALL_NAV_ITEMS, SETTINGS_ITEM } from "./navigation";

// Pagine caricate su richiesta: il primo caricamento scarica solo la shell e la pagina aperta.
// Pagine già operative; le altre mostrano cosa conterranno e in quale fase.
const READY = new Set([
  "/",
  "/movimenti",
  "/spese",
  "/entrate",
  "/investimenti",
  "/patrimonio",
  "/budget",
  "/ricorrenze",
  "/regole",
  SETTINGS_ITEM.path,
]);

const plannedRoutes: RouteObject[] = ALL_NAV_ITEMS.filter((item) => !READY.has(item.path)).map(
  (item) => ({
    path: item.path.slice(1),
    lazy: async () => {
      const { PlannedPage } = await import("@/pages/PlannedPage");
      return { Component: () => <PlannedPage item={item} /> };
    },
  }),
);

export const routes: RouteObject[] = [
  // Pagine autonome, senza la shell: registrate su Enable Banking come Privacy URL e Terms URL.
  {
    path: "/privacy",
    lazy: async () => ({ Component: (await import("@/pages/PrivacyPage")).PrivacyPage }),
  },
  {
    path: "/termini",
    lazy: async () => ({ Component: (await import("@/pages/TermsPage")).TermsPage }),
  },
  {
    path: "/accesso",
    lazy: async () => ({ Component: (await import("@/pages/LoginPage")).LoginPage }),
  },
  {
    path: "/",
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import("@/pages/OverviewPage")).OverviewPage }),
      },
      {
        path: "movimenti",
        lazy: async () => ({
          Component: (await import("@/pages/TransactionsPage")).TransactionsPage,
        }),
      },
      {
        path: "spese",
        lazy: async () => ({ Component: (await import("@/pages/ExpensesPage")).ExpensesPage }),
      },
      {
        path: "entrate",
        lazy: async () => ({ Component: (await import("@/pages/IncomePage")).IncomePage }),
      },
      {
        path: "investimenti",
        lazy: async () => ({
          Component: (await import("@/pages/InvestmentsPage")).InvestmentsPage,
        }),
      },
      {
        path: "budget",
        lazy: async () => ({ Component: (await import("@/pages/BudgetPage")).BudgetPage }),
      },
      {
        path: "ricorrenze",
        lazy: async () => ({ Component: (await import("@/pages/RecurringPage")).RecurringPage }),
      },
      {
        path: "regole",
        lazy: async () => ({ Component: (await import("@/pages/RulesPage")).RulesPage }),
      },
      ...plannedRoutes,
      {
        path: SETTINGS_ITEM.path.slice(1),
        lazy: async () => ({ Component: (await import("@/pages/SettingsPage")).SettingsPage }),
      },
      {
        path: "patrimonio",
        lazy: async () => ({ Component: (await import("@/pages/NetWorthPage")).NetWorthPage }),
      },
      {
        // Ritorno dalla banca dopo il consenso (indirizzo registrato su Enable Banking).
        path: "impostazioni/ritorno-banca",
        lazy: async () => ({ Component: (await import("@/pages/BankReturnPage")).BankReturnPage }),
      },
      {
        path: "*",
        lazy: async () => ({ Component: (await import("@/pages/NotFoundPage")).NotFoundPage }),
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
