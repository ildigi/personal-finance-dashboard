// Generato da scripts/generate-api.mjs — non modificare a mano.

export interface paths {
    "/api/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Accounts */
        get: operations["list_accounts_api_accounts_get"];
        put?: never;
        /** Create Account */
        post: operations["create_account_api_accounts_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/accounts/{account_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Account */
        get: operations["get_account_api_accounts__account_id__get"];
        put?: never;
        post?: never;
        /**
         * Delete Account
         * @description Elimina un conto solo se non ha movimenti (i saldi storici vanno via in cascata).
         */
        delete: operations["delete_account_api_accounts__account_id__delete"];
        options?: never;
        head?: never;
        /** Update Account */
        patch: operations["update_account_api_accounts__account_id__patch"];
        trace?: never;
    };
    "/api/analytics/expenses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Expenses
         * @description Spese reali del periodo per categoria, confronto con il periodo precedente, medie.
         */
        get: operations["get_expenses_api_analytics_expenses_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/analytics/income": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Income
         * @description Entrate per tipologia, tasso di risparmio, medie.
         */
        get: operations["get_income_api_analytics_income_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/analytics/merchants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Merchants
         * @description Classifica dei merchant per spesa nel periodo.
         */
        get: operations["get_merchants_api_analytics_merchants_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/analytics/monthly": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Monthly
         * @description Serie mensile: spese per categoria, entrate, investito, saldo.
         */
        get: operations["get_monthly_api_analytics_monthly_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login */
        post: operations["login_api_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Logout */
        post: operations["logout_api_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Logout All
         * @description Chiude le sessioni su tutti i dispositivi (anche questa).
         */
        post: operations["logout_all_api_auth_logout_all_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sessions */
        get: operations["list_sessions_api_auth_sessions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Auth Status */
        get: operations["auth_status_api_auth_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/banks/aspsps": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Banks
         * @description Banche disponibili per il paese (in Sandbox solo banche di prova).
         */
        get: operations["list_banks_api_banks_aspsps_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/banks/authorize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Authorize
         * @description Prepara il consenso e restituisce l'indirizzo della banca (login e SCA lì).
         */
        post: operations["authorize_api_banks_authorize_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/banks/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Callback
         * @description Ritorno dalla banca: salva la sessione (cifrata) e sincronizza subito.
         */
        post: operations["callback_api_banks_callback_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/banks/sources/{source_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Disconnect
         * @description Scollega una banca: revoca il consenso; con `delete_data` elimina conti e movimenti,
         *     altrimenti li tiene e disattiva la sorgente.
         */
        delete: operations["disconnect_api_banks_sources__source_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/banks/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Banks Status
         * @description Credenziali presenti? (Nessuna chiamata esterna.)
         */
        get: operations["banks_status_api_banks_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/budgets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Budgets
         * @description Speso contro budget nel mese, proiezione a fine mese, avvisi, storico di 6 mesi.
         */
        get: operations["get_budgets_api_budgets_get"];
        put?: never;
        /** Post Budget */
        post: operations["post_budget_api_budgets_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/budgets/suggestion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Suggestion
         * @description Spesa media della categoria, per scegliere l'importo del budget.
         */
        get: operations["get_suggestion_api_budgets_suggestion_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/budgets/{budget_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete Budget
         * @description Toglie il budget dal mese corrente in poi; i mesi passati restano nello storico.
         */
        delete: operations["delete_budget_api_budgets__budget_id__delete"];
        options?: never;
        head?: never;
        /**
         * Patch Budget
         * @description Il nuovo importo vale dal mese corrente: la risposta può avere un `id` diverso.
         */
        patch: operations["patch_budget_api_budgets__budget_id__patch"];
        trace?: never;
    };
    "/api/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Categories */
        get: operations["list_categories_api_categories_get"];
        put?: never;
        /** Create Category */
        post: operations["create_category_api_categories_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/categories/{category_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Category */
        get: operations["get_category_api_categories__category_id__get"];
        put?: never;
        post?: never;
        /** Delete Category */
        delete: operations["delete_category_api_categories__category_id__delete"];
        options?: never;
        head?: never;
        /** Update Category */
        patch: operations["update_category_api_categories__category_id__patch"];
        trace?: never;
    };
    "/api/categories/{category_id}/merge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Merge Category
         * @description Unisce questa categoria in un'altra: movimenti, budget, merchant e regole passano
         *     alla destinazione; le sottocategorie confluiscono in quelle omonime (o vengono create).
         */
        post: operations["merge_category_api_categories__category_id__merge_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/categories/{category_id}/subcategories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Subcategory */
        post: operations["create_subcategory_api_categories__category_id__subcategories_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/classification/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Run Classification
         * @description Riclassifica tutti i movimenti (le correzioni manuali restano).
         */
        post: operations["run_classification_api_classification_run_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/classification/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Classification Stats */
        get: operations["classification_stats_api_classification_stats_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Health
         * @description Stato del backend e del database (connessione e migrazioni applicate).
         */
        get: operations["health_api_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/income-types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Income Types */
        get: operations["list_income_types_api_income_types_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/investments/portfolios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Portfolios
         * @description Prima i conti veri, poi quelli di prova.
         */
        get: operations["get_portfolios_api_investments_portfolios_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/investments/{portfolio_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Portfolio
         * @description Imposta (o toglie) la data di inizio dei rendimenti.
         */
        patch: operations["update_portfolio_api_investments__portfolio_id__patch"];
        trace?: never;
    };
    "/api/investments/{portfolio_id}/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Activity
         * @description Ordini eseguiti, dividendi, versamenti e la serie mensile, dalla data di inizio.
         */
        get: operations["get_activity_api_investments__portfolio_id__activity_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/investments/{portfolio_id}/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Live Refresh
         * @description Aggiornamento leggero di valore, liquidità e posizioni (2 richieste al broker).
         *     Il backend lo concede al massimo ogni 10 secondi; ordini e Pie restano alla sync.
         */
        post: operations["live_refresh_api_investments__portfolio_id__live_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/investments/{portfolio_id}/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Summary
         * @description Valore, capitale versato, guadagno e rendimenti, posizioni, Pie.
         */
        get: operations["get_summary_api_investments__portfolio_id__summary_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/merchants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Merchants
         * @description Per spesa decrescente. `used_only`: solo i merchant con almeno un movimento.
         */
        get: operations["list_merchants_api_merchants_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/merchants/{merchant_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Merchant */
        get: operations["get_merchant_api_merchants__merchant_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Update Merchant
         * @description Le modifiche valgono anche per il passato: i movimenti vengono riclassificati.
         */
        patch: operations["update_merchant_api_merchants__merchant_id__patch"];
        trace?: never;
    };
    "/api/merchants/{merchant_id}/merge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Merge Merchant
         * @description Unisce questo merchant in un altro (es. "AMZN Mktp" in "Amazon").
         */
        post: operations["merge_merchant_api_merchants__merchant_id__merge_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/mock/setup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Setup Mock Data
         * @description Crea le sorgenti di prova (se mancano) e le sincronizza.
         *     In produzione solo con la modalità demo attiva.
         */
        post: operations["setup_mock_data_api_mock_setup_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/networth": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Net Worth
         * @description Patrimonio di oggi per conto, storico giornaliero e variazioni a 30/90/365 giorni.
         */
        get: operations["get_net_worth_api_networth_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/recurring": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Recurring
         * @description Tutte le ricorrenze: proposte, confermate, terminate, rifiutate.
         */
        get: operations["list_recurring_api_recurring_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/recurring/upcoming": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Upcoming
         * @description Addebiti e accrediti attesi nei prossimi giorni (più quelli appena scaduti e non ancora
         *     arrivati), dalle ricorrenze confermate.
         */
        get: operations["list_upcoming_api_recurring_upcoming_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/recurring/{recurring_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete Recurring
         * @description Dimentica la ricorrenza e la tua decisione: se la serie c'è ancora, torna come proposta
         *     (così si "ripristina" una ricorrenza rifiutata).
         */
        delete: operations["delete_recurring_api_recurring__recurring_id__delete"];
        options?: never;
        head?: never;
        /**
         * Patch Recurring
         * @description Conferma, rifiuta, termina o correggi (correggere una proposta la conferma).
         */
        patch: operations["patch_recurring_api_recurring__recurring_id__patch"];
        trace?: never;
    };
    "/api/rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List Rules
         * @description Nell'ordine in cui vengono valutate: prima le tue, poi quelle di sistema.
         */
        get: operations["list_rules_api_rules_get"];
        put?: never;
        /** Create Rule */
        post: operations["create_rule_api_rules_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rules/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Preview
         * @description Prova una regola sui movimenti esistenti: cosa cambierebbe, senza salvare nulla.
         */
        post: operations["preview_api_rules_preview_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rules/reorder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reorder Rules
         * @description Assegna priorità 10, 20, 30, ... nell'ordine dato (solo le tue regole).
         */
        post: operations["reorder_rules_api_rules_reorder_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rules/{rule_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Rule */
        delete: operations["delete_rule_api_rules__rule_id__delete"];
        options?: never;
        head?: never;
        /** Update Rule */
        patch: operations["update_rule_api_rules__rule_id__patch"];
        trace?: never;
    };
    "/api/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sources */
        get: operations["list_sources_api_sources_get"];
        put?: never;
        /** Create Source */
        post: operations["create_source_api_sources_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sources/trading212": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Connect Trading212
         * @description Collega il conto Trading 212 (chiave nel file dei segreti) e lo sincronizza.
         */
        post: operations["connect_trading212_api_sources_trading212_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sources/trading212/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Trading212 Status
         * @description C'è il file con chiave e secret? La sorgente è già collegata? (Nessuna chiamata esterna.)
         */
        get: operations["trading212_status_api_sources_trading212_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sources/{source_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Source */
        get: operations["get_source_api_sources__source_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Source */
        patch: operations["update_source_api_sources__source_id__patch"];
        trace?: never;
    };
    "/api/sources/{source_id}/sync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sync Source
         * @description Sincronizza subito una sorgente (sola lettura presso il provider). Chiesta da te:
         *     per le banche vale come lettura con l'utente presente.
         */
        post: operations["sync_source_api_sources__source_id__sync_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subcategories/{subcategory_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete Subcategory
         * @description Solo se nulla la usa; altrimenti `POST /subcategories/{id}/merge`.
         */
        delete: operations["delete_subcategory_api_subcategories__subcategory_id__delete"];
        options?: never;
        head?: never;
        /** Update Subcategory */
        patch: operations["update_subcategory_api_subcategories__subcategory_id__patch"];
        trace?: never;
    };
    "/api/subcategories/{subcategory_id}/merge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Merge Subcategory Into
         * @description Elimina la sottocategoria spostando movimenti, regole, budget, ricorrenze, merchant e
         *     correzioni su un'altra della stessa categoria (o su nessuna), poi riclassifica.
         */
        post: operations["merge_subcategory_into_api_subcategories__subcategory_id__merge_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/subcategories/{subcategory_id}/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Subcategory Usage */
        get: operations["get_subcategory_usage_api_subcategories__subcategory_id__usage_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sync-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sync Logs */
        get: operations["list_sync_logs_api_sync_logs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Tags */
        get: operations["list_tags_api_tags_get"];
        put?: never;
        /** Create Tag */
        post: operations["create_tag_api_tags_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/transactions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Transactions */
        get: operations["list_transactions_api_transactions_get"];
        put?: never;
        /**
         * Create Transaction
         * @description Inserimento manuale di un movimento.
         */
        post: operations["create_transaction_api_transactions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/transactions/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Bulk Update
         * @description Azioni multiple: categoria, tipo, tipologia di entrata, tag.
         */
        post: operations["bulk_update_api_transactions_bulk_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/transactions/{transaction_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Transaction */
        get: operations["get_transaction_api_transactions__transaction_id__get"];
        put?: never;
        post?: never;
        /**
         * Delete Transaction
         * @description Solo i movimenti inseriti a mano si possono eliminare.
         */
        delete: operations["delete_transaction_api_transactions__transaction_id__delete"];
        options?: never;
        head?: never;
        /**
         * Patch Transaction
         * @description Correzione manuale: sopravvive alle sincronizzazioni successive.
         */
        patch: operations["patch_transaction_api_transactions__transaction_id__patch"];
        trace?: never;
    };
    "/api/transactions/{transaction_id}/learn": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Learn Suggestion
         * @description Dopo una correzione: proposta di applicarla ai movimenti simili o di creare una regola.
         */
        get: operations["get_learn_suggestion_api_transactions__transaction_id__learn_get"];
        put?: never;
        /** Learn */
        post: operations["learn_api_transactions__transaction_id__learn_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/transactions/{transaction_id}/overrides": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Reset Transaction Classification
         * @description Ripristina la classificazione automatica: toglie le correzioni (le note restano).
         */
        delete: operations["reset_transaction_classification_api_transactions__transaction_id__overrides_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/transfers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Pair Transfer
         * @description Conferma a mano un trasferimento interno tra due tuoi conti.
         */
        post: operations["pair_transfer_api_transfers_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/transfers/dismiss": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dismiss Transfer
         * @description Non è un trasferimento: scioglie la coppia e non la propone più.
         */
        post: operations["dismiss_transfer_api_transfers_dismiss_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/transfers/suggestions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Transfer Suggestions
         * @description Coppie possibili (importi opposti, date vicine, conti diversi) ma senza indizi.
         */
        get: operations["transfer_suggestions_api_transfers_suggestions_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AccountCreate */
        AccountCreate: {
            /** Color */
            color?: string | null;
            /**
             * Currency
             * @default EUR
             * @example EUR
             */
            currency?: string;
            /** External Id */
            external_id: string;
            /** Iban */
            iban?: string | null;
            /**
             * Include In Net Worth
             * @default true
             */
            include_in_net_worth?: boolean;
            /** Institution */
            institution: string;
            /**
             * Is Active
             * @default true
             */
            is_active?: boolean;
            /** Name */
            name: string;
            /** Source Id */
            source_id: number;
            type: components["schemas"]["AccountType"];
        };
        /** AccountRead */
        AccountRead: {
            /** Balance */
            balance: string | null;
            /** Balance As Of */
            balance_as_of: string | null;
            /** Balance Type */
            balance_type: ("available" | "booked") | null;
            /** Color */
            color: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Currency */
            currency: string;
            /** External Id */
            external_id: string;
            /** Iban */
            iban: string | null;
            /** Id */
            id: number;
            /** Include In Net Worth */
            include_in_net_worth: boolean;
            /** Institution */
            institution: string;
            /** Is Active */
            is_active: boolean;
            /** Name */
            name: string;
            /** Source Id */
            source_id: number;
            type: components["schemas"]["AccountType"];
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /**
         * AccountType
         * @enum {string}
         */
        AccountType: "checking" | "savings" | "card" | "credit_card" | "broker";
        /** AccountUpdate */
        AccountUpdate: {
            /** Color */
            color?: string | null;
            /** Include In Net Worth */
            include_in_net_worth?: boolean | null;
            /** Is Active */
            is_active?: boolean | null;
            /** Name */
            name?: string | null;
        };
        /**
         * ActiveReturns
         * @description Solo le posizioni in mano: come il risultato delle Pie nell'app. Come Trading 212,
         *     la liquidità nelle Pie non ancora investita conta sia nel costo sia nel valore.
         */
        ActiveReturns: {
            /**
             * Cost Eur
             * @description Costo dei titoli + liquidità nelle Pie (= totalCost)
             */
            cost_eur: string;
            /**
             * Pct
             * @description Guadagno / costo, non annualizzato
             */
            pct: number | null;
            /**
             * Pl Eur
             * @description Valore − costo delle posizioni aperte
             */
            pl_eur: string;
            /** Value Eur */
            value_eur: string;
        };
        /** AuthStatus */
        AuthStatus: {
            /**
             * Authenticated
             * @description Questa richiesta ha una sessione valida
             */
            authenticated: boolean;
            /**
             * Configured
             * @description Password e codice già impostati
             */
            configured: boolean;
            /**
             * Enabled
             * @description Accesso richiesto (sul server); spento in locale
             */
            enabled: boolean;
        };
        /**
         * AuthorizeRequest
         * @description Nuova banca (`aspsp_name` + `country`) oppure rinnovo di una sorgente (`source_id`:
         *     banca e paese si prendono dal consenso precedente).
         */
        AuthorizeRequest: {
            /** Aspsp Name */
            aspsp_name?: string | null;
            /**
             * Country
             * @default IT
             */
            country?: string;
            /**
             * Psu Type
             * @default personal
             * @enum {string}
             */
            psu_type?: "personal" | "business";
            /**
             * Source Id
             * @description Sorgente di cui rinnovare il consenso
             */
            source_id?: number | null;
        };
        /** AuthorizeResponse */
        AuthorizeResponse: {
            /**
             * Url
             * @description Pagina della banca dove autorizzare la lettura dei conti
             */
            url: string;
        };
        /**
         * Averages
         * @description Media mensile sui mesi interi più recenti (esclusi quelli prima dei primi dati).
         */
        Averages: {
            /** M12 */
            m12: string | null;
            /** M3 */
            m3: string | null;
            /** M6 */
            m6: string | null;
        };
        /** BankRead */
        BankRead: {
            /** Beta */
            beta: boolean;
            /** Country */
            country: string;
            /** Logo */
            logo: string | null;
            /** Max Consent Days */
            max_consent_days: number | null;
            /** Name */
            name: string;
            /** Psu Types */
            psu_types: string[];
        };
        /** BanksStatus */
        BanksStatus: {
            /**
             * Credentials Found
             * @description Ci sono application ID e chiave privata?
             */
            credentials_found: boolean;
            /**
             * Environment
             * @description sandbox | production
             */
            environment: string | null;
            /**
             * Redirect Url
             * @description Da registrare identico nel Control Panel
             */
            redirect_url: string;
        };
        /** BudgetCreate */
        BudgetCreate: {
            /**
             * Alert Threshold Pct
             * @default 80
             */
            alert_threshold_pct?: number;
            /**
             * Amount
             * @example -12.50
             */
            amount: string;
            /** Category Id */
            category_id: number;
            /** Subcategory Id */
            subcategory_id?: number | null;
        };
        /** BudgetMonth */
        BudgetMonth: {
            /**
             * Amount
             * @description Nullo = nessun budget in quel mese
             */
            amount: string | null;
            /** Month */
            month: string;
            /** Spent Eur */
            spent_eur: string;
        };
        /** BudgetOverview */
        BudgetOverview: {
            /**
             * Date From
             * Format: date
             */
            date_from: string;
            /**
             * Date To
             * Format: date
             */
            date_to: string;
            /** Days Elapsed */
            days_elapsed: number;
            /** Days In Month */
            days_in_month: number;
            /** Is Current */
            is_current: boolean;
            /** Items */
            items: components["schemas"]["BudgetStatus"][];
            /** Month */
            month: string;
            /** Over Count */
            over_count: number;
            /**
             * Total Amount
             * @description Somma dei budget (senza doppioni categoria/sotto)
             */
            total_amount: string;
            /** Total Projected Eur */
            total_projected_eur: string;
            /** Total Spent Eur */
            total_spent_eur: string;
            /** Warning Count */
            warning_count: number;
        };
        /** BudgetStatus */
        BudgetStatus: {
            /** Alert Threshold Pct */
            alert_threshold_pct: number;
            /** Amount */
            amount: string;
            /** Category Id */
            category_id: number;
            /** Color */
            color: string | null;
            /**
             * History
             * @description Ultimi 6 mesi, dal più vecchio
             */
            history: components["schemas"]["BudgetMonth"][];
            /** Icon */
            icon: string | null;
            /** Id */
            id: number;
            /**
             * Level
             * @description ok, warning (soglia di avviso), over (100% o più)
             * @enum {string}
             */
            level: "ok" | "warning" | "over";
            /** Name */
            name: string;
            /**
             * Projected Eur
             * @description Stima a fine mese (nei mesi passati = speso)
             */
            projected_eur: string;
            /**
             * Projected Over
             * @description La proiezione supera il budget
             */
            projected_over: boolean;
            /** Projected Pct */
            projected_pct: number;
            /**
             * Recurring Expected Eur
             * @description Addebiti ricorrenti confermati ancora attesi nel mese
             */
            recurring_expected_eur: string;
            /**
             * Remaining Eur
             * @description Negativo = sforato
             */
            remaining_eur: string;
            /** Spent Eur */
            spent_eur: string;
            /** Subcategory Id */
            subcategory_id: number | null;
            /** Used Pct */
            used_pct: number;
            /**
             * Valid From
             * Format: date
             */
            valid_from: string;
        };
        /**
         * BudgetSuggestion
         * @description Quanto spendi di solito nella categoria, per scegliere l'importo.
         */
        BudgetSuggestion: {
            /** Average 3M */
            average_3m: string | null;
            /** Average 6M */
            average_6m: string | null;
            /** Current Month */
            current_month: string;
            /** Last Month */
            last_month: string | null;
        };
        /**
         * BudgetUpdate
         * @description Cambiare l'importo vale dal mese corrente: i mesi passati restano col budget di allora.
         */
        BudgetUpdate: {
            /** Alert Threshold Pct */
            alert_threshold_pct?: number | null;
            /** Amount */
            amount?: string | null;
        };
        /** BulkResult */
        BulkResult: {
            /** Updated */
            updated: number;
        };
        /**
         * CallbackRequest
         * @description I parametri con cui la banca rimanda alla dashboard.
         */
        CallbackRequest: {
            /** Code */
            code?: string | null;
            /** Error */
            error?: string | null;
            /** Error Description */
            error_description?: string | null;
            /** State */
            state: string;
        };
        /** CallbackResponse */
        CallbackResponse: {
            /**
             * Accounts
             * @description Conti autorizzati
             */
            accounts: number;
            /** Institution */
            institution: string;
            /** Source Id */
            source_id: number;
            sync: components["schemas"]["SyncSummaryRead"];
        };
        /** CashFlowRead */
        CashFlowRead: {
            /** Amount Eur */
            amount_eur: string;
            /** Id */
            id: number;
            /**
             * Occurred At
             * Format: date-time
             */
            occurred_at: string;
            /**
             * Transaction Id
             * @description Bonifico abbinato in banca, se trovato
             */
            transaction_id: number | null;
            /** Type */
            type: string;
        };
        /** CategoryCreate */
        CategoryCreate: {
            /** Color */
            color?: string | null;
            /**
             * Excluded From Spending
             * @default false
             */
            excluded_from_spending?: boolean;
            /** Icon */
            icon?: string | null;
            /** @default expense */
            kind?: components["schemas"]["CategoryKind"];
            /** Name */
            name: string;
            /** Sort Order */
            sort_order?: number | null;
        };
        /**
         * CategoryKind
         * @enum {string}
         */
        CategoryKind: "expense" | "income" | "transfer" | "investment";
        /** CategoryMerge */
        CategoryMerge: {
            /** Into Id */
            into_id: number;
        };
        /** CategoryMergeResult */
        CategoryMergeResult: {
            category: components["schemas"]["CategoryRead"];
            /** Moved Transactions */
            moved_transactions: number;
        };
        /** CategoryRead */
        CategoryRead: {
            /** Code */
            code: string | null;
            /** Color */
            color: string | null;
            /** Excluded From Spending */
            excluded_from_spending: boolean;
            /** Icon */
            icon: string | null;
            /** Id */
            id: number;
            /** Is Archived */
            is_archived: boolean;
            /** Is System */
            is_system: boolean;
            kind: components["schemas"]["CategoryKind"];
            /** Name */
            name: string;
            /** Sort Order */
            sort_order: number | null;
            /** Subcategories */
            subcategories: components["schemas"]["SubcategoryRead"][];
        };
        /** CategoryTotal */
        CategoryTotal: {
            /**
             * Category Id
             * @description Nullo = movimenti da classificare
             */
            category_id: number | null;
            /** Color */
            color: string | null;
            /** Count */
            count: number;
            /** Icon */
            icon: string | null;
            /**
             * Name
             * @description Nullo per i movimenti da classificare
             */
            name: string | null;
            /** Previous Eur */
            previous_eur: string;
            /** Share Pct */
            share_pct: number;
            /** Subcategories */
            subcategories: components["schemas"]["SubcategoryTotal"][];
            /** Total Eur */
            total_eur: string;
        };
        /** CategoryUpdate */
        CategoryUpdate: {
            /** Color */
            color?: string | null;
            /** Excluded From Spending */
            excluded_from_spending?: boolean | null;
            /** Icon */
            icon?: string | null;
            /** Is Archived */
            is_archived?: boolean | null;
            /** Name */
            name?: string | null;
            /** Sort Order */
            sort_order?: number | null;
        };
        /** ClassificationRunResult */
        ClassificationRunResult: {
            /** Changed */
            changed: number;
            /** Investment Links */
            investment_links: number;
            /** Merchants Created */
            merchants_created: number;
            /** Refunds Linked */
            refunds_linked: number;
            /** Total */
            total: number;
            /** Transfer Pairs */
            transfer_pairs: number;
        };
        /**
         * ClassificationSource
         * @enum {string}
         */
        ClassificationSource: "manual" | "rule" | "merchant" | "provider" | "heuristic" | "none";
        /** ClassificationStats */
        ClassificationStats: {
            /** Active Rules */
            active_rules: number;
            /** Auto Classified */
            auto_classified: number;
            /**
             * Auto Pct
             * @description Quota classificata in automatico, 0-100
             */
            auto_pct: number;
            /** By Source */
            by_source: {
                [key: string]: number;
            };
            /** Manual */
            manual: number;
            /** Stale Rules */
            stale_rules: number;
            /** Total */
            total: number;
            /** Transfer Suggestions */
            transfer_suggestions: number;
            /** Unclassified */
            unclassified: number;
        };
        /** DatabaseHealth */
        DatabaseHealth: {
            /** Migration Current */
            migration_current?: string | null;
            /** Migration Head */
            migration_head?: string | null;
            /** Ok */
            ok: boolean;
            /**
             * Up To Date
             * @default false
             */
            up_to_date?: boolean;
        };
        /** @enum {string} */
        DescriptionCode: "fx_cost" | "fx_gain" | "money_transfer";
        /**
         * Direction
         * @enum {string}
         */
        Direction: "out" | "in";
        /** DisconnectResponse */
        DisconnectResponse: {
            /**
             * Deleted Transactions
             * @description Movimenti eliminati (0 se tenuti)
             */
            deleted_transactions: number;
        };
        /** DividendRead */
        DividendRead: {
            /** Amount Eur */
            amount_eur: string;
            /** Id */
            id: number;
            /** Name */
            name: string | null;
            /**
             * Paid On
             * Format: date
             */
            paid_on: string;
            /** Quantity */
            quantity: string | null;
            /** Ticker */
            ticker: string;
        };
        /** ExpensesSummary */
        ExpensesSummary: {
            averages: components["schemas"]["Averages"];
            /** Categories */
            categories: components["schemas"]["CategoryTotal"][];
            /** Count */
            count: number;
            /** Delta Eur */
            delta_eur: string;
            /** Delta Pct */
            delta_pct: number | null;
            /**
             * Invested Eur
             * @description Spostati e investiti: versamenti netti al broker
             */
            invested_eur: string;
            period: components["schemas"]["Period"];
            /** Previous Invested Eur */
            previous_invested_eur: string;
            /** @description Stesso intervallo, spostato indietro, fino allo stesso giorno */
            previous_period: components["schemas"]["Period"];
            /** Previous Total Eur */
            previous_total_eur: string;
            /**
             * Subscriptions Monthly Eur
             * @description Abbonamenti confermati tra le ricorrenze (equivalente mensile); se non ce ne sono, media mensile della categoria Abbonamenti negli ultimi 3 mesi interi
             */
            subscriptions_monthly_eur: string | null;
            /**
             * Subscriptions Source
             * @enum {string}
             */
            subscriptions_source: "recurring" | "average";
            /**
             * Total Eur
             * @description Spese reali (spese + commissioni − rimborsi), in positivo
             */
            total_eur: string;
            /** Unclassified Count */
            unclassified_count: number;
        };
        /**
         * Frequency
         * @enum {string}
         */
        Frequency: "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** Health */
        Health: {
            database: components["schemas"]["DatabaseHealth"];
            /** Environment */
            environment: string;
            /**
             * Status
             * @enum {string}
             */
            status: "ok" | "degraded" | "error";
            /** Version */
            version: string;
        };
        /** IncomeClassificationRead */
        IncomeClassificationRead: {
            /** Code */
            code: string;
            /** Id */
            id: number;
            /** Is System */
            is_system: boolean;
            /** Label */
            label: string;
        };
        /** IncomeSummary */
        IncomeSummary: {
            averages: components["schemas"]["Averages"];
            /** By Type */
            by_type: components["schemas"]["IncomeTypeTotal"][];
            /** Count */
            count: number;
            /** Delta Pct */
            delta_pct: number | null;
            /**
             * Dividends Eur
             * @description Dividendi del broker nel periodo (voce separata)
             */
            dividends_eur: string;
            /** Expenses Eur */
            expenses_eur: string;
            period: components["schemas"]["Period"];
            previous_period: components["schemas"]["Period"];
            /** Previous Total Eur */
            previous_total_eur: string;
            /** Savings Eur */
            savings_eur: string;
            /**
             * Savings Rate Pct
             * @description (entrate − spese reali) / entrate
             */
            savings_rate_pct: number | null;
            /** Total Eur */
            total_eur: string;
        };
        /** IncomeTypeTotal */
        IncomeTypeTotal: {
            /** Code */
            code: string;
            /** Count */
            count: number;
            /** Income Type Id */
            income_type_id: number | null;
            /** Label */
            label: string;
            /** Total Eur */
            total_eur: string;
        };
        /** InvestmentActivity */
        InvestmentActivity: {
            /** Cash Flows */
            cash_flows: components["schemas"]["CashFlowRead"][];
            /** Dividends */
            dividends: components["schemas"]["DividendRead"][];
            /** Months */
            months: components["schemas"]["InvestmentMonth"][];
            /** Orders */
            orders: components["schemas"]["OrderRead"][];
        };
        /** InvestmentMonth */
        InvestmentMonth: {
            /** Bought Eur */
            bought_eur: string;
            /** Deposits Eur */
            deposits_eur: string;
            /** Dividends Eur */
            dividends_eur: string;
            /** Interest Eur */
            interest_eur: string;
            /** Month */
            month: string;
            /**
             * Net Deposited Eur
             * @description Capitale netto versato a fine mese
             */
            net_deposited_eur: string;
            /** Sold Eur */
            sold_eur: string;
            /**
             * Value Eur
             * @description Valore a fine mese, se c'è un'istantanea
             */
            value_eur: string | null;
            /** Withdrawals Eur */
            withdrawals_eur: string;
        };
        /** InvestmentSummary */
        InvestmentSummary: {
            active: components["schemas"]["ActiveReturns"];
            /**
             * As Of
             * @description Ultimo aggiornamento del portafoglio
             */
            as_of: string | null;
            breakdown: components["schemas"]["PlBreakdown"];
            /**
             * Cash Eur
             * @description Liquidità non investita (anche quella nelle Pie)
             */
            cash_eur: string;
            /**
             * Deposits Eur
             * @description Versamenti dalla data di inizio
             */
            deposits_eur: string;
            /** Dividend Yield On Cost Pct */
            dividend_yield_on_cost_pct: number | null;
            /** Dividends 12M Eur */
            dividends_12m_eur: string;
            /**
             * Net Deposited Eur
             * @description Capitale netto versato: saldo di partenza + versamenti − prelievi
             */
            net_deposited_eur: string;
            /**
             * Opening Balance Eur
             * @description Saldo alla data di inizio (liquidità + costo delle posizioni): capitale di partenza. Zero senza data di inizio
             */
            opening_balance_eur: string;
            /** Pies */
            pies: components["schemas"]["PieRead"][];
            portfolio: components["schemas"]["PortfolioRead"];
            /** Positions */
            positions: components["schemas"]["PositionRead"][];
            /**
             * Positions Cost Eur
             * @description Costo delle posizioni aperte
             */
            positions_cost_eur: string;
            /** Positions Value Eur */
            positions_value_eur: string;
            returns: components["schemas"]["Returns"];
            /**
             * Value Eur
             * @description Valore del conto: posizioni + liquidità
             */
            value_eur: string;
            /**
             * Withdrawals Eur
             * @description Prelievi dalla data di inizio
             */
            withdrawals_eur: string;
        };
        /** LearnRequest */
        LearnRequest: {
            scope: components["schemas"]["LearnScope"];
        };
        /** LearnResult */
        LearnResult: {
            rule: components["schemas"]["RuleRead"] | null;
            /** Updated */
            updated: number;
        };
        /**
         * LearnScope
         * @enum {string}
         */
        LearnScope: "past" | "rule";
        /**
         * LearnSuggestion
         * @description Dopo una correzione: "applicare 'Abbonamenti › AI' ai movimenti di OpenAI?".
         */
        LearnSuggestion: {
            actions: components["schemas"]["RuleActions"];
            conditions: components["schemas"]["RuleConditions"];
            /** Merchant Id */
            merchant_id: number | null;
            /** Rule Name */
            rule_name: string;
            /**
             * Similar Count
             * @description Movimenti passati simili con un'altra classificazione
             */
            similar_count: number;
            /**
             * Subject
             * @description Merchant o controparte a cui si applicherebbe
             */
            subject: string;
            /** Transaction Id */
            transaction_id: number;
        };
        /**
         * LiveRefresh
         * @description Aggiornamento leggero di valore, liquidità e posizioni.
         */
        LiveRefresh: {
            /**
             * As Of
             * @description Istante dell'ultima istantanea
             */
            as_of: string | null;
            /**
             * Message Code
             * @description Perché non è stato aggiornato, se c'è un errore (codice di messaggio)
             */
            message_code: string | null;
            /** Message Params */
            message_params: {
                [key: string]: unknown;
            };
            /**
             * Refreshed
             * @description Falso se troppo ravvicinato, in corso o non possibile
             */
            refreshed: boolean;
        };
        /** LoginRequest */
        LoginRequest: {
            /**
             * Code
             * @description Codice dell'app di autenticazione
             */
            code: string;
            /** Password */
            password: string;
        };
        /** ManualOverrideRead */
        ManualOverrideRead: {
            /** Field */
            field: string;
            /** New Value */
            new_value: string | null;
            /** Old Value */
            old_value: string | null;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /** MerchantMerge */
        MerchantMerge: {
            /**
             * Into Id
             * @description Il merchant che resta
             */
            into_id: number;
        };
        /**
         * MerchantOrigin
         * @enum {string}
         */
        MerchantOrigin: "seed" | "auto" | "user";
        /** MerchantPage */
        MerchantPage: {
            /** Items */
            items: components["schemas"]["MerchantWithStats"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
        };
        /** MerchantRead */
        MerchantRead: {
            /** Aliases */
            aliases: string[];
            /** Default Category Id */
            default_category_id: number | null;
            /** Default Subcategory Id */
            default_subcategory_id: number | null;
            /** Id */
            id: number;
            /** Name */
            name: string;
            /** Normalized Key */
            normalized_key: string;
            origin: components["schemas"]["MerchantOrigin"];
        };
        /** MerchantTotal */
        MerchantTotal: {
            /** Average Eur */
            average_eur: string;
            /** Category Id */
            category_id: number | null;
            /** Count */
            count: number;
            /**
             * Last Date
             * Format: date
             */
            last_date: string;
            /** Merchant Id */
            merchant_id: number;
            /** Name */
            name: string;
            /** Total Eur */
            total_eur: string;
        };
        /** MerchantUpdate */
        MerchantUpdate: {
            /** Aliases */
            aliases?: string[] | null;
            /** Default Category Id */
            default_category_id?: number | null;
            /** Default Subcategory Id */
            default_subcategory_id?: number | null;
            /** Name */
            name?: string | null;
        };
        /** MerchantWithStats */
        MerchantWithStats: {
            /** Aliases */
            aliases: string[];
            /** Default Category Id */
            default_category_id: number | null;
            /** Default Subcategory Id */
            default_subcategory_id: number | null;
            /** Id */
            id: number;
            /** Last Date */
            last_date: string | null;
            /** Name */
            name: string;
            /** Normalized Key */
            normalized_key: string;
            origin: components["schemas"]["MerchantOrigin"];
            /**
             * Spent Eur
             * @description Spese reali, in positivo
             * @default 0
             */
            spent_eur: string;
            /**
             * Transaction Count
             * @default 0
             */
            transaction_count: number;
        };
        /** MergeResult */
        MergeResult: {
            merchant: components["schemas"]["MerchantRead"];
            /** Moved Transactions */
            moved_transactions: number;
        };
        /** MonthCategory */
        MonthCategory: {
            /**
             * Category Id
             * @description Nullo = movimenti da classificare
             */
            category_id: number | null;
            /** Total Eur */
            total_eur: string;
        };
        /** MonthPoint */
        MonthPoint: {
            /** Categories */
            categories: components["schemas"]["MonthCategory"][];
            /** Expenses Eur */
            expenses_eur: string;
            /** Income Eur */
            income_eur: string;
            /** Invested Eur */
            invested_eur: string;
            /**
             * Month
             * @description AAAA-MM
             */
            month: string;
            /**
             * Net Eur
             * @description Entrate − spese reali
             */
            net_eur: string;
        };
        /** MonthlySeries */
        MonthlySeries: {
            /** Months */
            months: components["schemas"]["MonthPoint"][];
        };
        /** NetWorthAccount */
        NetWorthAccount: {
            /** Account Id */
            account_id: number;
            /** As Of */
            as_of: string | null;
            /** Currency */
            currency: string;
            /** History From */
            history_from: string | null;
            /** Institution */
            institution: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "cash" | "investments";
            /** Name */
            name: string;
            /**
             * Share Pct
             * @description Quota del patrimonio (solo valori positivi)
             */
            share_pct: number | null;
            /** Type */
            type: string;
            /**
             * Value Eur
             * @description None se il conto non ha ancora un saldo
             */
            value_eur: string | null;
        };
        /** NetWorthChange */
        NetWorthChange: {
            /** Cash Delta Eur */
            cash_delta_eur: string | null;
            /** Days */
            days: number;
            /**
             * Delta Eur
             * @description None se uno dei due giorni è parziale o stimato: il confronto non regge
             */
            delta_eur: string | null;
            /** Delta Pct */
            delta_pct: number | null;
            /**
             * From Date
             * Format: date
             */
            from_date: string;
        };
        /** NetWorthOverview */
        NetWorthOverview: {
            /** Accounts */
            accounts: components["schemas"]["NetWorthAccount"][];
            /**
             * As Of
             * Format: date
             */
            as_of: string;
            /** Cash Eur */
            cash_eur: string;
            /** Changes */
            changes: components["schemas"]["NetWorthChange"][];
            /** Complete From */
            complete_from: string | null;
            /** Investments Eur */
            investments_eur: string;
            /** Series */
            series: components["schemas"]["NetWorthPoint"][];
            /** Total Eur */
            total_eur: string;
        };
        /** NetWorthPoint */
        NetWorthPoint: {
            /** Cash Eur */
            cash_eur: string;
            /**
             * Date
             * Format: date
             */
            date: string;
            /** Estimated */
            estimated: boolean;
            /** Investments Eur */
            investments_eur: string;
            /** Partial */
            partial: boolean;
            /** Total Eur */
            total_eur: string;
        };
        /** OrderRead */
        OrderRead: {
            /**
             * Executed At
             * Format: date-time
             */
            executed_at: string;
            /** Fees Eur */
            fees_eur: string | null;
            /** Fill Price */
            fill_price: string;
            /** Id */
            id: number;
            /** Instrument Currency */
            instrument_currency: string;
            /** Name */
            name: string | null;
            /** Quantity */
            quantity: string;
            /** Side */
            side: string;
            /** Ticker */
            ticker: string;
            /** Value Eur */
            value_eur: string;
        };
        /** Period */
        Period: {
            /**
             * Date From
             * Format: date
             */
            date_from: string;
            /**
             * Date To
             * Format: date
             */
            date_to: string;
        };
        /** PieInstrumentRead */
        PieInstrumentRead: {
            /** Current Share Pct */
            current_share_pct: number;
            /** Expected Share Pct */
            expected_share_pct: number;
            /** Name */
            name: string | null;
            /** Result Eur */
            result_eur: string;
            /** Ticker */
            ticker: string;
            /** Value Eur */
            value_eur: string;
        };
        /** PieRead */
        PieRead: {
            /**
             * Cash Eur
             * @description Liquidità nella Pie non ancora investita
             */
            cash_eur: string;
            /** Dividend Action */
            dividend_action: string | null;
            /** Goal Eur */
            goal_eur: string | null;
            /** Id */
            id: number;
            /** Instruments */
            instruments: components["schemas"]["PieInstrumentRead"][];
            /**
             * Invested Eur
             * @description Base investita come nell'app: costo dei titoli + liquidità della Pie
             */
            invested_eur: string;
            /** Name */
            name: string;
            /** Result Eur */
            result_eur: string;
            /**
             * Result Pct
             * @description Risultato / investito, non annualizzato
             */
            result_pct: number | null;
            /**
             * Value Eur
             * @description Valore dei titoli + liquidità della Pie
             */
            value_eur: string;
        };
        /** PlBreakdown */
        PlBreakdown: {
            /** Dividends Eur */
            dividends_eur: string;
            /**
             * Fees Eur
             * @description Commissioni (positive = pagate)
             */
            fees_eur: string;
            /** Interest Eur */
            interest_eur: string;
            /**
             * Other Eur
             * @description Il resto: cambi, arrotondamenti, eventi societari
             */
            other_eur: string;
            /** Realized Eur */
            realized_eur: string;
            /** Unrealized Eur */
            unrealized_eur: string;
        };
        /** PortfolioRead */
        PortfolioRead: {
            /** Id */
            id: number;
            /** Institution */
            institution: string;
            /** Is Mock */
            is_mock: boolean;
            /** Last Sync At */
            last_sync_at: string | null;
            /** Name */
            name: string;
            /** Source Id */
            source_id: number;
            /**
             * Tracking Start
             * @description Data di inizio dei rendimenti: lo storico precedente si ignora
             */
            tracking_start: string | null;
        };
        /** PortfolioUpdate */
        PortfolioUpdate: {
            /**
             * Tracking Start
             * @description Data di inizio dei rendimenti; null = tutto lo storico
             */
            tracking_start: string | null;
        };
        /** PositionRead */
        PositionRead: {
            /** Avg Price */
            avg_price: string;
            /** Cost Eur */
            cost_eur: string;
            /** Current Price */
            current_price: string;
            /** Instrument Currency */
            instrument_currency: string;
            /** Isin */
            isin: string | null;
            /** Name */
            name: string | null;
            /** Pie Name */
            pie_name: string | null;
            /** Pl Eur */
            pl_eur: string;
            /** Pl Pct */
            pl_pct: number | null;
            /** Quantity */
            quantity: string;
            /** Ticker */
            ticker: string;
            /** Value Eur */
            value_eur: string;
            /**
             * Weight Pct
             * @description Peso sul valore delle posizioni
             */
            weight_pct: number;
        };
        /** PreviewChange */
        PreviewChange: {
            /** After Category Id */
            after_category_id: number | null;
            after_kind: components["schemas"]["TransactionKind"];
            /** After Subcategory Id */
            after_subcategory_id: number | null;
            /** Amount Eur */
            amount_eur: string;
            /** Before Category Id */
            before_category_id: number | null;
            before_kind: components["schemas"]["TransactionKind"];
            /** Before Subcategory Id */
            before_subcategory_id: number | null;
            /**
             * Booking Date
             * Format: date
             */
            booking_date: string;
            /** Description */
            description: string;
            /** Transaction Id */
            transaction_id: number;
        };
        /**
         * Provider
         * @enum {string}
         */
        Provider: "enablebanking" | "trading212" | "mock" | "manual";
        /** RecurringOverview */
        RecurringOverview: {
            /** Items */
            items: components["schemas"]["RecurringRead"][];
            summary: components["schemas"]["RecurringSummary"];
        };
        /** RecurringRead */
        RecurringRead: {
            /** Amount Tolerance Pct */
            amount_tolerance_pct: string;
            /** Category Id */
            category_id: number | null;
            /** Confidence */
            confidence: number | null;
            /** Direction */
            direction: string;
            /** Expected Amount */
            expected_amount: string;
            /** Frequency */
            frequency: string;
            /** Id */
            id: number;
            /** Interval Days */
            interval_days: number | null;
            /**
             * Is Late
             * @description Confermata, ma l'ultimo addebito atteso non è arrivato
             */
            is_late: boolean;
            /** Kind */
            kind: string;
            /** Last Seen Date */
            last_seen_date: string | null;
            /** Merchant Id */
            merchant_id: number | null;
            /**
             * Monthly Eur
             * @description Equivalente mensile dell'importo atteso
             */
            monthly_eur: string;
            /** Name */
            name: string;
            /** Next Expected Date */
            next_expected_date: string | null;
            /**
             * Occurrences
             * @description Movimenti collegati
             */
            occurrences: number;
            /** Status */
            status: string;
            /** Subcategory Id */
            subcategory_id: number | null;
        };
        /**
         * RecurringSummary
         * @description Equivalenti mensili delle ricorrenze confermate.
         */
        RecurringSummary: {
            /** Confirmed Count */
            confirmed_count: number;
            /**
             * Expenses Monthly Eur
             * @description Spese e commissioni ricorrenti
             */
            expenses_monthly_eur: string;
            /** Income Monthly Eur */
            income_monthly_eur: string;
            /**
             * Invested Monthly Eur
             * @description Versamenti ricorrenti al broker
             */
            invested_monthly_eur: string;
            /** Late Count */
            late_count: number;
            /**
             * Subscriptions Monthly Eur
             * @description Solo la categoria Abbonamenti
             */
            subscriptions_monthly_eur: string;
            /** Suggested Count */
            suggested_count: number;
        };
        /**
         * RecurringUpdate
         * @description Correggere una proposta la conferma.
         */
        RecurringUpdate: {
            /** Amount Tolerance Pct */
            amount_tolerance_pct?: number | null;
            /** Expected Amount */
            expected_amount?: string | null;
            frequency?: components["schemas"]["Frequency"] | null;
            /** Interval Days */
            interval_days?: number | null;
            /** Name */
            name?: string | null;
            /** Status */
            status?: ("confirmed" | "rejected" | "ended") | null;
        };
        /**
         * Returns
         * @description Rendimenti dalla data di inizio. Nessuno di questi conta i versamenti come guadagno.
         */
        Returns: {
            /**
             * Average Invested Eur
             * @description Capitale netto versato medio nel tempo, dal primo versamento
             */
            average_invested_eur: string;
            /**
             * Days
             * @description Giorni dal primo versamento (o dalla data di inizio)
             */
            days: number;
            /**
             * Mwr Annual Pct
             * @description Annuo ponderato per il denaro (XIRR), solo se affidabile: almeno un anno di storia e capitale investito in media per almeno metà del versato attuale
             */
            mwr_annual_pct: number | null;
            /**
             * Simple Pct
             * @description Rendimento principale: guadagno / capitale netto versato
             */
            simple_pct: number | null;
            /**
             * Total Pl Eur
             * @description Valore attuale − capitale netto versato
             */
            total_pl_eur: string;
        };
        /** RuleActions */
        RuleActions: {
            /** Category Id */
            category_id?: number | null;
            /** Income Type Id */
            income_type_id?: number | null;
            kind?: components["schemas"]["TransactionKind"] | null;
            /** Merchant Id */
            merchant_id?: number | null;
            /** Subcategory Id */
            subcategory_id?: number | null;
            /** Tag Ids */
            tag_ids?: number[] | null;
        };
        /**
         * RuleConditions
         * @description Condizioni in AND. Gli importi sono in EUR e senza segno: il verso lo dà `direction`.
         */
        RuleConditions: {
            /** Account Id */
            account_id?: number | null;
            /** Amount Max */
            amount_max?: string | null;
            /** Amount Min */
            amount_min?: string | null;
            /** Amounts */
            amounts?: string[] | null;
            /** Counterparty Iban */
            counterparty_iban?: string | null;
            /** Description Contains */
            description_contains?: string | null;
            /** Description Regex */
            description_regex?: string | null;
            direction?: components["schemas"]["Direction"] | null;
            /** Mcc */
            mcc?: string | null;
            /** Merchant Id */
            merchant_id?: number | null;
        };
        /** RuleCreate */
        RuleCreate: {
            actions: components["schemas"]["RuleActions"];
            conditions: components["schemas"]["RuleConditions"];
            /**
             * Is Active
             * @default true
             */
            is_active?: boolean;
            /** Name */
            name: string;
            /**
             * Priority
             * @default 100
             */
            priority?: number;
        };
        /**
         * RuleOrigin
         * @enum {string}
         */
        RuleOrigin: "seed" | "user" | "learned";
        /** RulePreview */
        RulePreview: {
            /**
             * Blocked
             * @description Movimenti che soddisfano le condizioni ma restano come sono (correzione manuale, trasferimento, regola con priorità più alta)
             */
            blocked: number;
            /**
             * Changed
             * @description Movimenti la cui classificazione cambierebbe
             */
            changed: number;
            /** Changes */
            changes: components["schemas"]["PreviewChange"][];
            /**
             * Matched
             * @description Movimenti che soddisfano le condizioni
             */
            matched: number;
        };
        /**
         * RulePreviewRequest
         * @description Prova una regola sui movimenti esistenti senza salvarla.
         *
         *     Con `rule_id` la regola indicata viene sostituita da questa versione.
         */
        RulePreviewRequest: {
            actions: components["schemas"]["RuleActions"];
            conditions: components["schemas"]["RuleConditions"];
            /**
             * Name
             * @default Anteprima
             */
            name?: string;
            /**
             * Priority
             * @default 100
             */
            priority?: number;
            /** Rule Id */
            rule_id?: number | null;
        };
        /** RuleRead */
        RuleRead: {
            actions: components["schemas"]["RuleActions"];
            /** Code */
            code: string | null;
            conditions: components["schemas"]["RuleConditions"];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Id */
            id: number;
            /** Is Active */
            is_active: boolean;
            /**
             * Is Stale
             * @default false
             */
            is_stale: boolean;
            /** Last Matched At */
            last_matched_at: string | null;
            /** Match Count */
            match_count: number;
            /** Name */
            name: string;
            origin: components["schemas"]["RuleOrigin"];
            /** Priority */
            priority: number;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /**
         * RuleReorder
         * @description Nuovo ordine delle regole (prima = valutata per prima).
         */
        RuleReorder: {
            /** Rule Ids */
            rule_ids: number[];
        };
        /** RuleUpdate */
        RuleUpdate: {
            actions?: components["schemas"]["RuleActions"] | null;
            conditions?: components["schemas"]["RuleConditions"] | null;
            /** Is Active */
            is_active?: boolean | null;
            /** Name */
            name?: string | null;
            /** Priority */
            priority?: number | null;
        };
        /** SessionRead */
        SessionRead: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Expires At
             * Format: date-time
             */
            expires_at: string;
            /**
             * Last Seen At
             * Format: date-time
             */
            last_seen_at: string;
            /** User Agent */
            user_agent: string | null;
        };
        /** SourceCreate */
        SourceCreate: {
            /** Consent Expires At */
            consent_expires_at?: string | null;
            /** Display Name */
            display_name: string;
            /** Institution */
            institution: string;
            provider: components["schemas"]["Provider"];
            /** @default active */
            status?: components["schemas"]["SourceStatus"];
        };
        /**
         * SourceRead
         * @description Nessun riferimento a segreti o sessioni cifrate nell'output.
         */
        SourceRead: {
            /** Consent Expires At */
            consent_expires_at: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Display Name */
            display_name: string;
            /** Id */
            id: number;
            /** Institution */
            institution: string;
            /** Last Sync At */
            last_sync_at: string | null;
            provider: components["schemas"]["Provider"];
            status: components["schemas"]["SourceStatus"];
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        /**
         * SourceStatus
         * @enum {string}
         */
        SourceStatus: "active" | "expired" | "error" | "disabled";
        /** SourceUpdate */
        SourceUpdate: {
            /** Consent Expires At */
            consent_expires_at?: string | null;
            /** Display Name */
            display_name?: string | null;
            status?: components["schemas"]["SourceStatus"] | null;
        };
        /** SubcategoryCreate */
        SubcategoryCreate: {
            /** Name */
            name: string;
            /** Sort Order */
            sort_order?: number | null;
        };
        /**
         * SubcategoryMerge
         * @description Destinazione di movimenti, regole e budget; `null` = nessuna sottocategoria (restano
         *     nella categoria).
         */
        SubcategoryMerge: {
            /** Into Id */
            into_id: number | null;
        };
        /** SubcategoryMergeResult */
        SubcategoryMergeResult: {
            category: components["schemas"]["CategoryRead"];
            /** Moved Transactions */
            moved_transactions: number;
        };
        /** SubcategoryRead */
        SubcategoryRead: {
            /** Category Id */
            category_id: number;
            /** Code */
            code: string | null;
            /** Id */
            id: number;
            /** Is Archived */
            is_archived: boolean;
            /** Name */
            name: string;
            /** Sort Order */
            sort_order: number | null;
        };
        /** SubcategoryTotal */
        SubcategoryTotal: {
            /** Count */
            count: number;
            /**
             * Name
             * @description Nullo = senza sottocategoria (il testo lo sceglie il frontend)
             */
            name: string | null;
            /** Subcategory Id */
            subcategory_id: number | null;
            /** Total Eur */
            total_eur: string;
        };
        /** SubcategoryUpdate */
        SubcategoryUpdate: {
            /** Is Archived */
            is_archived?: boolean | null;
            /** Name */
            name?: string | null;
            /** Sort Order */
            sort_order?: number | null;
        };
        /**
         * SubcategoryUsage
         * @description Cosa usa una sottocategoria: se è tutto zero si elimina subito.
         */
        SubcategoryUsage: {
            /** Budgets */
            budgets: number;
            /** In Use */
            in_use: boolean;
            /** Merchants */
            merchants: number;
            /** Overrides */
            overrides: number;
            /** Recurring */
            recurring: number;
            /** Rules */
            rules: number;
            /** Transactions */
            transactions: number;
        };
        /**
         * SyncJob
         * @enum {string}
         */
        SyncJob: "accounts" | "balances" | "transactions" | "portfolio" | "orders" | "dividends" | "cash_flows" | "pies" | "fx_rates" | "classification";
        /** SyncJobRead */
        SyncJobRead: {
            /** Created */
            created: number;
            /** Details */
            details: {
                [key: string]: number;
            };
            /** Error */
            error: string | null;
            /** Error Code */
            error_code: string | null;
            /** Error Params */
            error_params: {
                [key: string]: unknown;
            };
            /** Fetched */
            fetched: number;
            job: components["schemas"]["SyncJob"];
            status: components["schemas"]["SyncStatus"];
            /** Updated */
            updated: number;
        };
        /** SyncLogRead */
        SyncLogRead: {
            /** Error Code */
            error_code: string | null;
            /** Error Message */
            error_message: string | null;
            /** Error Params */
            error_params: {
                [key: string]: unknown;
            } | null;
            /** Finished At */
            finished_at: string | null;
            /** Id */
            id: number;
            /** Items Created */
            items_created: number | null;
            /** Items Fetched */
            items_fetched: number | null;
            /** Items Updated */
            items_updated: number | null;
            job: components["schemas"]["SyncJob"];
            /** Source Id */
            source_id: number;
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            status: components["schemas"]["SyncStatus"];
        };
        /**
         * SyncStatus
         * @enum {string}
         */
        SyncStatus: "running" | "success" | "partial" | "error";
        /** SyncSummaryRead */
        SyncSummaryRead: {
            /**
             * Finished At
             * Format: date-time
             */
            finished_at: string;
            /** Jobs */
            jobs: components["schemas"]["SyncJobRead"][];
            /** Source Id */
            source_id: number;
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            status: components["schemas"]["SyncStatus"];
        };
        /** TagCreate */
        TagCreate: {
            /** Color */
            color?: string | null;
            /** Name */
            name: string;
        };
        /** TagRead */
        TagRead: {
            /** Color */
            color: string | null;
            /** Id */
            id: number;
            /** Name */
            name: string;
        };
        /** Trading212Status */
        Trading212Status: {
            /** Credentials Found */
            credentials_found: boolean;
            /** Source Id */
            source_id: number | null;
        };
        /**
         * TransactionBulkUpdate
         * @description Stessa correzione su più movimenti (registrata come correzione manuale).
         */
        TransactionBulkUpdate: {
            /** Add Tag Ids */
            add_tag_ids?: number[];
            /** Category Id */
            category_id?: number | null;
            /** Ids */
            ids: number[];
            /** Income Type Id */
            income_type_id?: number | null;
            kind?: components["schemas"]["TransactionKind"] | null;
            /** Remove Tag Ids */
            remove_tag_ids?: number[];
            /** Subcategory Id */
            subcategory_id?: number | null;
        };
        /**
         * TransactionCreate
         * @description Inserimento manuale (es. carta di credito non disponibile via PSD2).
         */
        TransactionCreate: {
            /** Account Id */
            account_id: number;
            /**
             * Amount
             * @description Con segno: negativo = uscita
             * @example -12.50
             */
            amount: string;
            /**
             * Amount Eur
             * @description Obbligatorio se la valuta non è EUR
             */
            amount_eur?: string | null;
            /**
             * Booking Date
             * Format: date
             */
            booking_date: string;
            /** Category Id */
            category_id?: number | null;
            /** Counterparty Name */
            counterparty_name?: string | null;
            /**
             * Currency
             * @default EUR
             * @example EUR
             */
            currency?: string;
            /** Description */
            description: string;
            /** Fx Rate */
            fx_rate?: string | null;
            /** Income Type Id */
            income_type_id?: number | null;
            /** @description Se assente: expense per le uscite, income per le entrate */
            kind?: components["schemas"]["TransactionKind"] | null;
            /** Notes */
            notes?: string | null;
            /** @default booked */
            status?: components["schemas"]["TransactionStatus"];
            /** Subcategory Id */
            subcategory_id?: number | null;
            /** Value Date */
            value_date?: string | null;
        };
        /**
         * TransactionDetail
         * @description Dettaglio: include il dato grezzo del provider e le correzioni manuali.
         */
        TransactionDetail: {
            /** Account Id */
            account_id: number;
            /** Amount */
            amount: string;
            /** Amount Eur */
            amount_eur: string;
            /**
             * Booking Date
             * Format: date
             */
            booking_date: string;
            /** Category Id */
            category_id: number | null;
            /** Classification Note */
            classification_note: string | null;
            /** Classification Params */
            classification_params: {
                [key: string]: unknown;
            } | null;
            /** Classification Reason */
            classification_reason: string | null;
            classification_source: components["schemas"]["ClassificationSource"];
            /** Counterparty Iban */
            counterparty_iban: string | null;
            /** Counterparty Name */
            counterparty_name: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Currency */
            currency: string;
            /** Description Clean */
            description_clean: string;
            /**
             * @description Movimenti scritti dalla dashboard o col testo scelto da lei: il frontend ne mostra la
             *     descrizione nella lingua dell'utente. La descrizione salvata non cambia (fa parte
             *     dell'impronta anti-doppioni ed è riconosciuta dalla regola `fx_conversion_cost`).
             */
            readonly description_code: components["schemas"]["DescriptionCode"] | null;
            /** Description Raw */
            description_raw: string;
            /** External Id */
            external_id: string | null;
            /** Fx Rate */
            fx_rate: string | null;
            /** Id */
            id: number;
            /** Income Type Id */
            income_type_id: number | null;
            /** Is Manual */
            is_manual: boolean;
            kind: components["schemas"]["TransactionKind"];
            /** Mcc */
            mcc: string | null;
            /** Merchant Id */
            merchant_id: number | null;
            /** Merchant Name */
            merchant_name: string | null;
            /** Notes */
            notes: string | null;
            /** Original Amount */
            original_amount: string | null;
            /** Original Currency */
            original_currency: string | null;
            /** Overrides */
            overrides: components["schemas"]["ManualOverrideRead"][];
            /** Provider Category */
            provider_category: string | null;
            /** Raw */
            raw: {
                [key: string]: unknown;
            } | null;
            /** Recurring Id */
            recurring_id: number | null;
            /** Refund Of Id */
            refund_of_id: number | null;
            /** Rule Id */
            rule_id: number | null;
            status: components["schemas"]["TransactionStatus"];
            /** Subcategory Id */
            subcategory_id: number | null;
            /** Tags */
            tags: components["schemas"]["TagRead"][];
            /** Transfer Pair Id */
            transfer_pair_id: number | null;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
            /** Value Date */
            value_date: string | null;
        };
        /**
         * TransactionKind
         * @enum {string}
         */
        TransactionKind: "expense" | "income" | "internal_transfer" | "investment_transfer" | "refund" | "fee" | "other";
        /** TransactionPage */
        TransactionPage: {
            /** Items */
            items: components["schemas"]["TransactionRead"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /** Total */
            total: number;
            totals: components["schemas"]["TransactionTotals"];
        };
        /**
         * TransactionPair
         * @description Due movimenti da abbinare (o da non abbinare più) come trasferimento interno.
         */
        TransactionPair: {
            /**
             * In Id
             * @description Il movimento in entrata
             */
            in_id: number;
            /**
             * Out Id
             * @description Il movimento in uscita
             */
            out_id: number;
        };
        /** TransactionRead */
        TransactionRead: {
            /** Account Id */
            account_id: number;
            /** Amount */
            amount: string;
            /** Amount Eur */
            amount_eur: string;
            /**
             * Booking Date
             * Format: date
             */
            booking_date: string;
            /** Category Id */
            category_id: number | null;
            /** Classification Note */
            classification_note: string | null;
            /** Classification Params */
            classification_params: {
                [key: string]: unknown;
            } | null;
            /** Classification Reason */
            classification_reason: string | null;
            classification_source: components["schemas"]["ClassificationSource"];
            /** Counterparty Iban */
            counterparty_iban: string | null;
            /** Counterparty Name */
            counterparty_name: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Currency */
            currency: string;
            /** Description Clean */
            description_clean: string;
            /**
             * @description Movimenti scritti dalla dashboard o col testo scelto da lei: il frontend ne mostra la
             *     descrizione nella lingua dell'utente. La descrizione salvata non cambia (fa parte
             *     dell'impronta anti-doppioni ed è riconosciuta dalla regola `fx_conversion_cost`).
             */
            readonly description_code: components["schemas"]["DescriptionCode"] | null;
            /** Description Raw */
            description_raw: string;
            /** External Id */
            external_id: string | null;
            /** Fx Rate */
            fx_rate: string | null;
            /** Id */
            id: number;
            /** Income Type Id */
            income_type_id: number | null;
            /** Is Manual */
            is_manual: boolean;
            kind: components["schemas"]["TransactionKind"];
            /** Merchant Id */
            merchant_id: number | null;
            /** Merchant Name */
            merchant_name: string | null;
            /** Notes */
            notes: string | null;
            /** Original Amount */
            original_amount: string | null;
            /** Original Currency */
            original_currency: string | null;
            /** Recurring Id */
            recurring_id: number | null;
            /** Refund Of Id */
            refund_of_id: number | null;
            /** Rule Id */
            rule_id: number | null;
            status: components["schemas"]["TransactionStatus"];
            /** Subcategory Id */
            subcategory_id: number | null;
            /** Tags */
            tags: components["schemas"]["TagRead"][];
            /** Transfer Pair Id */
            transfer_pair_id: number | null;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
            /** Value Date */
            value_date: string | null;
        };
        /**
         * TransactionStatus
         * @enum {string}
         */
        TransactionStatus: "pending" | "booked";
        /**
         * TransactionTotals
         * @description Totali dell'intero filtro (non solo della pagina), in EUR.
         */
        TransactionTotals: {
            /** Count */
            count: number;
            /** Inflow Eur */
            inflow_eur: string;
            /** Outflow Eur */
            outflow_eur: string;
        };
        /**
         * TransactionUpdate
         * @description Correzione di un movimento.
         *
         *     I campi di classificazione si possono correggere su tutti i movimenti e la
         *     correzione viene registrata in `manual_overrides`. Date, importi e descrizione
         *     sono modificabili solo sui movimenti inseriti a mano.
         */
        TransactionUpdate: {
            /** Amount */
            amount?: string | null;
            /** Amount Eur */
            amount_eur?: string | null;
            /** Booking Date */
            booking_date?: string | null;
            /** Category Id */
            category_id?: number | null;
            /** Counterparty Name */
            counterparty_name?: string | null;
            /** Currency */
            currency?: string | null;
            /** Description */
            description?: string | null;
            /** Fx Rate */
            fx_rate?: string | null;
            /** Income Type Id */
            income_type_id?: number | null;
            kind?: components["schemas"]["TransactionKind"] | null;
            /** Merchant Id */
            merchant_id?: number | null;
            /** Notes */
            notes?: string | null;
            status?: components["schemas"]["TransactionStatus"] | null;
            /** Subcategory Id */
            subcategory_id?: number | null;
            /** Value Date */
            value_date?: string | null;
        };
        /**
         * TransferSuggestion
         * @description Abbinamento possibile ma senza indizi: da confermare o scartare.
         */
        TransferSuggestion: {
            inflow: components["schemas"]["TransactionRead"];
            outflow: components["schemas"]["TransactionRead"];
        };
        /** UpcomingCharge */
        UpcomingCharge: {
            /**
             * Amount Eur
             * @description Con segno: negativo = uscita
             */
            amount_eur: string;
            /** Category Id */
            category_id: number | null;
            /**
             * Date
             * Format: date
             */
            date: string;
            /** Direction */
            direction: string;
            /** Kind */
            kind: string;
            /** Name */
            name: string;
            /**
             * Overdue
             * @description Data passata, movimento non ancora arrivato
             */
            overdue: boolean;
            /** Recurring Id */
            recurring_id: number;
            /** Status */
            status: string;
            /** Subcategory Id */
            subcategory_id: number | null;
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    list_accounts_api_accounts_get: {
        parameters: {
            query?: {
                include_inactive?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_account_api_accounts_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_account_api_accounts__account_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                account_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_account_api_accounts__account_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                account_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_account_api_accounts__account_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                account_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AccountUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccountRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_expenses_api_analytics_expenses_get: {
        parameters: {
            query: {
                date_from: string;
                date_to: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExpensesSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_income_api_analytics_income_get: {
        parameters: {
            query: {
                date_from: string;
                date_to: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IncomeSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_merchants_api_analytics_merchants_get: {
        parameters: {
            query: {
                date_from: string;
                date_to: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MerchantTotal"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_monthly_api_analytics_monthly_get: {
        parameters: {
            query?: {
                months?: number;
                /** @description Un giorno dell'ultimo mese; default oggi */
                end?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MonthlySeries"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_api_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_api_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    logout_all_api_auth_logout_all_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    list_sessions_api_auth_sessions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionRead"][];
                };
            };
        };
    };
    auth_status_api_auth_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthStatus"];
                };
            };
        };
    };
    list_banks_api_banks_aspsps_get: {
        parameters: {
            query?: {
                country?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BankRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    authorize_api_banks_authorize_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthorizeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthorizeResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    callback_api_banks_callback_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CallbackRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CallbackResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    disconnect_api_banks_sources__source_id__delete: {
        parameters: {
            query?: {
                delete_data?: boolean;
            };
            header?: never;
            path: {
                source_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DisconnectResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    banks_status_api_banks_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BanksStatus"];
                };
            };
        };
    };
    get_budgets_api_budgets_get: {
        parameters: {
            query?: {
                /** @description AAAA-MM, default il corrente */
                month?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BudgetOverview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    post_budget_api_budgets_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BudgetCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BudgetStatus"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_suggestion_api_budgets_suggestion_get: {
        parameters: {
            query: {
                category_id: number;
                subcategory_id?: number | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BudgetSuggestion"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_budget_api_budgets__budget_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                budget_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_budget_api_budgets__budget_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                budget_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BudgetUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BudgetStatus"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_categories_api_categories_get: {
        parameters: {
            query?: {
                include_archived?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_category_api_categories_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CategoryCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_category_api_categories__category_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_category_api_categories__category_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_category_api_categories__category_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CategoryUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    merge_category_api_categories__category_id__merge_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CategoryMerge"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryMergeResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_subcategory_api_categories__category_id__subcategories_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                category_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubcategoryCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubcategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    run_classification_api_classification_run_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClassificationRunResult"];
                };
            };
        };
    };
    classification_stats_api_classification_stats_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClassificationStats"];
                };
            };
        };
    };
    health_api_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Health"];
                };
            };
        };
    };
    list_income_types_api_income_types_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["IncomeClassificationRead"][];
                };
            };
        };
    };
    get_portfolios_api_investments_portfolios_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortfolioRead"][];
                };
            };
        };
    };
    update_portfolio_api_investments__portfolio_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                portfolio_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PortfolioUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PortfolioRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_activity_api_investments__portfolio_id__activity_get: {
        parameters: {
            query?: {
                limit?: number;
            };
            header?: never;
            path: {
                portfolio_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvestmentActivity"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    live_refresh_api_investments__portfolio_id__live_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                portfolio_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiveRefresh"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_summary_api_investments__portfolio_id__summary_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                portfolio_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvestmentSummary"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_merchants_api_merchants_get: {
        parameters: {
            query?: {
                q?: string | null;
                used_only?: boolean;
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MerchantPage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_merchant_api_merchants__merchant_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                merchant_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MerchantWithStats"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_merchant_api_merchants__merchant_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                merchant_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MerchantUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MerchantRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    merge_merchant_api_merchants__merchant_id__merge_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                merchant_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MerchantMerge"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MergeResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    setup_mock_data_api_mock_setup_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SyncSummaryRead"][];
                };
            };
        };
    };
    get_net_worth_api_networth_get: {
        parameters: {
            query?: {
                /** @description Primo giorno dello storico; vuoto = tutto quello che c'è */
                since?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetWorthOverview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_recurring_api_recurring_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecurringOverview"];
                };
            };
        };
    };
    list_upcoming_api_recurring_upcoming_get: {
        parameters: {
            query?: {
                days?: number;
                direction?: components["schemas"]["Direction"] | null;
                include_suggested?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UpcomingCharge"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_recurring_api_recurring__recurring_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                recurring_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_recurring_api_recurring__recurring_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                recurring_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecurringUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecurringRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_rules_api_rules_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuleRead"][];
                };
            };
        };
    };
    create_rule_api_rules_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RuleCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuleRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_api_rules_preview_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RulePreviewRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RulePreview"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reorder_rules_api_rules_reorder_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RuleReorder"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuleRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_rule_api_rules__rule_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rule_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_rule_api_rules__rule_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                rule_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RuleUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuleRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_sources_api_sources_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourceRead"][];
                };
            };
        };
    };
    create_source_api_sources_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SourceCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourceRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    connect_trading212_api_sources_trading212_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SyncSummaryRead"];
                };
            };
        };
    };
    trading212_status_api_sources_trading212_status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Trading212Status"];
                };
            };
        };
    };
    get_source_api_sources__source_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourceRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_source_api_sources__source_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SourceUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourceRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sync_source_api_sources__source_id__sync_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                source_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SyncSummaryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_subcategory_api_subcategories__subcategory_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                subcategory_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_subcategory_api_subcategories__subcategory_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                subcategory_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubcategoryUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubcategoryRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    merge_subcategory_into_api_subcategories__subcategory_id__merge_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                subcategory_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubcategoryMerge"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubcategoryMergeResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_subcategory_usage_api_subcategories__subcategory_id__usage_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                subcategory_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubcategoryUsage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_sync_logs_api_sync_logs_get: {
        parameters: {
            query?: {
                source_id?: number | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SyncLogRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_tags_api_tags_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TagRead"][];
                };
            };
        };
    };
    create_tag_api_tags_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TagCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TagRead"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_transactions_api_transactions_get: {
        parameters: {
            query?: {
                date_from?: string | null;
                date_to?: string | null;
                account_id?: number[] | null;
                kind?: components["schemas"]["TransactionKind"][] | null;
                category_id?: number | null;
                subcategory_id?: number | null;
                merchant_id?: number | null;
                income_type_id?: number | null;
                rule_id?: number | null;
                recurring_id?: number | null;
                status?: components["schemas"]["TransactionStatus"] | null;
                uncategorized?: boolean | null;
                /** @description Solo i movimenti che nessun passo ha classificato */
                unclassified?: boolean | null;
                q?: string | null;
                /** @description Importo in EUR, con segno */
                amount_min?: number | string | null;
                /** @description Importo in EUR, con segno */
                amount_max?: number | string | null;
                sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionPage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    create_transaction_api_transactions_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransactionCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    bulk_update_api_transactions_bulk_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransactionBulkUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BulkResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_transaction_api_transactions__transaction_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                transaction_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_transaction_api_transactions__transaction_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                transaction_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    patch_transaction_api_transactions__transaction_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                transaction_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransactionUpdate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_learn_suggestion_api_transactions__transaction_id__learn_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                transaction_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LearnSuggestion"] | null;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    learn_api_transactions__transaction_id__learn_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                transaction_id: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LearnRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LearnResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reset_transaction_classification_api_transactions__transaction_id__overrides_delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                transaction_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionDetail"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    pair_transfer_api_transfers_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransactionPair"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    dismiss_transfer_api_transfers_dismiss_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TransactionPair"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionRead"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    transfer_suggestions_api_transfers_suggestions_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransferSuggestion"][];
                };
            };
        };
    };
}
