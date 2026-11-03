import type { Widen } from "../../types";
import type { pages as it } from "../it/pages";

export const pages = {
  login: {
    documentTitle: "Sign in",
    title: "Sign in to Finance",
    description: "Password and authenticator app code",
    notConfigured:
      "Sign-in is turned on but not configured yet. On the server, run <code>python -m app.auth.cli setup</code>.",
    password: "Password",
    code: "Code",
    submit: "Sign in",
  },
  bankReturn: {
    noFlow: "No connection in progress",
    failed: "Connection failed",
    connected: "{{bank}} connected",
    connecting: "Connecting the bank…",
    noFlowHint: "This page opens when you come back from the bank, after the authorization.",
    accounts_one: "{{count}} account authorized",
    accounts_other: "{{count}} accounts authorized",
    saving: "Saving the bank consent and downloading accounts, balances and transactions.",
    toTransactions: "Go to transactions",
    toSettings: "Back to settings",
  },
  notFound: {
    title: "Page not found",
    back: "Back to the overview",
    text: "The address doesn't match any page of the dashboard.",
  },
  legal: {
    brand: "Finance — Personal dashboard",
    dashboard: "Dashboard",
    updated: "Last updated: {{date}}",
    privacy: {
      title: "Privacy policy",
      who: {
        title: "Who uses this app",
        p1: "This is a personal dashboard for managing one's own finances, used only by its owner. It runs locally on the owner's computer (in the future it may run on their own private server). It is not a service offered to other people.",
        p2: "The data controller is the owner of the dashboard, who is also the only person whose data is processed.",
      },
      data: {
        title: "What data is read",
        banks:
          "<strong>Bank accounts</strong>, through Enable Banking (an account information service under the PSD2 directive): list of accounts, balances and transactions of the owner's accounts only.",
        broker: "<strong>Investments on Trading 212</strong>, through the official read-only API.",
        readOnly:
          "Access is <strong>read-only</strong>: the app can't make payments or move money. It never sees the bank's passwords: sign-in and strong authentication happen directly in the bank's app or website.",
      },
      why: {
        title: "Why",
        p1: "For personal use only: keeping a budget, classifying expenses and following how accounts and investments are doing.",
      },
      where: {
        title: "Where it is stored",
        db: "In a local PostgreSQL database, on the owner's computer.",
        tokens: "The bank consent session tokens are stored encrypted.",
        thirdParties:
          "The data is not sold, shared or sent to third parties, apart from the providers needed to obtain it (Enable Banking and the bank).",
        tracking:
          "No analytics or tracking tools and no profiling cookies. The browser only remembers local preferences, such as the theme and privacy mode (in localStorage).",
      },
      consent: {
        title: "Bank consent duration and revocation",
        p1: "The bank consent lasts at most 180 days. It can be revoked at any time from <strong>Settings → Disconnect</strong>, which also closes the session at Enable Banking, or directly at the bank.",
        p2: "When disconnecting, you can also delete the data already downloaded, with “Delete accounts and transactions”.",
      },
    },
    terms: {
      title: "Terms of use",
      personal: {
        title: "Personal use",
        p1: "This dashboard is meant for the personal, non-commercial use of its owner only. It offers no service to third parties and does not connect other people's accounts.",
      },
      readOnly: {
        title: "Read-only",
        p1: "The app reads accounts, balances, transactions and investments, but it can't make payments or change anything at the bank or the broker.",
      },
      noWarranty: {
        title: "No warranty on the data",
        figures:
          "The figures come from banks and brokers and may be incomplete, late or inaccurate.",
        classification:
          "Transactions are classified automatically and the classification can be wrong.",
        advice:
          "What is shown is not financial advice: for decisions, the official statements of the bank and the broker prevail.",
      },
      revoke: {
        title: "Revocation",
        p1: "The owner can revoke the bank consent at any time from <strong>Settings → Disconnect</strong> or directly at the bank.",
      },
    },
  },
} as const satisfies Widen<typeof it>;
