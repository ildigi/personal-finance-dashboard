/** Pagine fuori dalle sezioni: accesso, ritorno dalla banca, 404, privacy e termini. */
export const pages = {
  login: {
    documentTitle: "Accesso",
    title: "Accedi a Finanze",
    description: "Password e codice dell'app di autenticazione",
    notConfigured:
      "L'accesso è attivo ma non è ancora configurato. Sul server esegui <code>python -m app.auth.cli setup</code>.",
    password: "Password",
    code: "Codice",
    submit: "Accedi",
  },
  bankReturn: {
    noFlow: "Nessun collegamento in corso",
    failed: "Collegamento non riuscito",
    connected: "{{bank}} collegata",
    connecting: "Collegamento della banca…",
    noFlowHint: "Questa pagina si apre al ritorno dalla banca, dopo l'autorizzazione.",
    accounts_one: "{{count}} conto autorizzato",
    accounts_other: "{{count}} conti autorizzati",
    saving: "Salvo il consenso e scarico conti, saldi e movimenti.",
    toTransactions: "Vai ai movimenti",
    toSettings: "Torna alle impostazioni",
  },
  notFound: {
    title: "Pagina non trovata",
    back: "Torna alla panoramica",
    text: "L'indirizzo non corrisponde a nessuna pagina della dashboard.",
  },
  legal: {
    brand: "Finanze — Dashboard personale",
    dashboard: "Dashboard",
    updated: "Ultimo aggiornamento: {{date}}",
    privacy: {
      title: "Informativa sulla privacy",
      who: {
        title: "Chi usa questa app",
        p1: "Questa è una dashboard personale per la gestione delle proprie finanze, usata soltanto dal suo proprietario. Funziona in locale sul computer del proprietario (in futuro potrà funzionare su un suo server privato). Non è un servizio offerto ad altre persone.",
        p2: "Il titolare del trattamento è il proprietario della dashboard, che è anche l'unica persona di cui vengono trattati i dati.",
      },
      data: {
        title: "Quali dati vengono letti",
        banks:
          "<strong>Conti bancari</strong>, tramite Enable Banking (servizio di informazione sui conti previsto dalla direttiva PSD2): elenco dei conti, saldi e movimenti dei soli conti del proprietario.",
        broker:
          "<strong>Investimenti su Trading 212</strong>, tramite l'API ufficiale in sola lettura.",
        readOnly:
          "L'accesso è <strong>in sola lettura</strong>: l'app non può disporre pagamenti né spostare denaro. Non vede mai le password della banca: l'accesso e l'autenticazione forte avvengono direttamente nell'app o nel sito della banca.",
      },
      why: {
        title: "Perché",
        p1: "Solo per uso personale: tenere un budget, classificare le spese e analizzare l'andamento di conti e investimenti.",
      },
      where: {
        title: "Dove sono conservati",
        db: "In un database PostgreSQL locale, sul computer del proprietario.",
        tokens: "I token della sessione di consenso sono conservati cifrati.",
        thirdParties:
          "I dati non vengono venduti, condivisi o inviati a terzi, a parte i fornitori necessari per ottenerli (Enable Banking e la banca).",
        tracking:
          "Nessuno strumento di analisi o tracciamento e nessun cookie di profilazione. Il browser ricorda solo preferenze locali, come il tema e la modalità privacy (in localStorage).",
      },
      consent: {
        title: "Durata del consenso e revoca",
        p1: "Il consenso dato alla banca dura al massimo 180 giorni. Si può revocare in qualsiasi momento da <strong>Impostazioni → Scollega</strong>, che chiude la sessione anche presso Enable Banking, oppure direttamente dalla banca.",
        p2: "Al momento dello scollegamento si possono anche cancellare i dati già scaricati, con «Elimina conti e movimenti».",
      },
    },
    terms: {
      title: "Termini di utilizzo",
      personal: {
        title: "Uso personale",
        p1: "Questa dashboard è destinata all'uso personale e non commerciale del solo proprietario. Non offre alcun servizio a terzi e non collega conti di altre persone.",
      },
      readOnly: {
        title: "Sola lettura",
        p1: "L'app legge conti, saldi, movimenti e investimenti, ma non può disporre pagamenti né modificare nulla presso la banca o il broker.",
      },
      noWarranty: {
        title: "Nessuna garanzia sui dati",
        figures:
          "Le cifre provengono da banche e broker e possono essere incomplete, in ritardo o inesatte.",
        classification: "La classificazione dei movimenti è automatica e può sbagliare.",
        advice:
          "Quanto mostrato non è una consulenza finanziaria: per le decisioni fanno fede gli estratti ufficiali della banca e del broker.",
      },
      revoke: {
        title: "Revoca",
        p1: "Il proprietario può revocare il consenso in qualsiasi momento da <strong>Impostazioni → Scollega</strong> oppure direttamente dalla banca.",
      },
    },
  },
} as const;
