import type { Widen } from "../../types";
import type { networth as it } from "../it/networth";

export const networth = {
  networth: {
    unavailable: "Net worth unavailable",
    noAccountsTitle: "No accounts to add up",
    noAccounts:
      "Connect a bank or the broker in Settings: net worth is calculated from their balances.",
    intro:
      "Accounts and investments added up, day by day. Available balance for banks, account value for the broker.",
    netWorth: "Net worth",
    cash: "Cash",
    investments: "Investments",
    estimated: "Investments (estimate)",
    lastYear: "Last year",
    in365: "{{pct}} in 365 days",
    need12: "12 months of complete data for every account are needed",
    trend: "Trend",
    completeFrom: "Complete data for every account since {{date}}",
    completing: "The history fills in as syncs save the balances",
    byAccount: "By account",
    byAccountDescription: "How much each account weighs on today's net worth",
    share: "{{pct}} of net worth",
    rangeLabel: "Period shown",
    ranges: {
      "3m": "3 months",
      "6m": "6 months",
      "1y": "1 year",
      all: "All",
    },
    greyZones: "The grey areas of the chart",
    coverageInvestments:
      "{{institution}}: actual value since {{date}}; before that it is estimated from net deposits.",
    coverageCash:
      "{{institution}}: history since {{date}}; before that the bank's data is missing.",
    kindInvestments: "investments",
    kindCash: "cash",
    balanceAsOf: "balance on {{date}}",
    partial: "Some accounts are missing: the total is partial",
    estimatedNote: "Investments estimated from net deposits",
    day: "Day",
  },
} as const satisfies Widen<typeof it>;
