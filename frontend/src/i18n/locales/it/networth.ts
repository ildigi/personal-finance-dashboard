/** Patrimonio netto: pagina e grafico. */
export const networth = {
  networth: {
    unavailable: "Patrimonio non disponibile",
    noAccountsTitle: "Nessun conto da sommare",
    noAccounts:
      "Collega una banca o il broker da Impostazioni: il patrimonio si calcola dai loro saldi.",
    intro:
      "Conti e investimenti sommati, giorno per giorno. Saldo disponibile delle banche, valore del conto per il broker.",
    netWorth: "Patrimonio netto",
    cash: "Liquidità",
    investments: "Investimenti",
    estimated: "Investimenti (stima)",
    lastYear: "Ultimo anno",
    in365: "{{pct}} in 365 giorni",
    need12: "Servono 12 mesi di dati completi per tutti i conti",
    trend: "Andamento",
    completeFrom: "Dati completi per tutti i conti dal {{date}}",
    completing: "Lo storico si completa man mano che le sincronizzazioni salvano i saldi",
    byAccount: "Per conto",
    byAccountDescription: "Quanto pesa ogni conto sul patrimonio di oggi",
    share: "{{pct}} del patrimonio",
    rangeLabel: "Periodo mostrato",
    ranges: {
      "3m": "3 mesi",
      "6m": "6 mesi",
      "1y": "1 anno",
      all: "Tutto",
    },
    greyZones: "Le zone grigie del grafico",
    coverageInvestments:
      "{{institution}}: valore reale dal {{date}}; prima è stimato con il capitale versato.",
    coverageCash: "{{institution}}: storico dal {{date}}; prima mancano i dati della banca.",
    kindInvestments: "investimenti",
    kindCash: "liquidità",
    balanceAsOf: "saldo al {{date}}",
    partial: "Manca qualche conto: il totale è parziale",
    estimatedNote: "Investimenti stimati con il capitale versato",
    day: "Giorno",
  },
} as const;
