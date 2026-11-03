# Finance Dashboard — Specifica tecnica e funzionale

> Documento di progetto originale (in italiano), scritto prima dello sviluppo e aggiornato fase per fase con le note di implementazione: Fase 2 nel §10, Fase 3 nel §14, Fase 4 nel §8, Fasi 5, 6 e 8 nel §11, Fase 7 nel §13, Fasi 9 e 10 nel §16.
> Nella versione pubblica i dati personali (conti, importi, date, nomi) sono stati rimossi o sostituiti.

## Decisioni già confermate

| Tema | Decisione |
|---|---|
| Esecuzione | Solo locale su Windows 11 nelle prime fasi; VPS privato (es. Hetzner) solo in futuro |
| Codice | `D:\Projects\finance-dashboard` — repository Git |
| Dati | `D:\FinanceData\` — fuori dal repo e da Git; l'app li trova tramite `DATA_DIR` |
| Database | PostgreSQL nativo (no Docker), dati del cluster su D: |
| Banca | Crédit Agricole **Italia** |
| Broker | Trading 212 conto **Invest** |
| Import | **Niente CSV.** Banche via Open Banking (PSD2). Unica eccezione: carta di credito CA se non esposta via PSD2 → prima inserimento manuale, CSV solo come ultima risorsa |
| Integrazioni | Solo lettura (read-only), sempre |
| Metodo | Fasi 0 → 10, stop e approvazione esplicita alla fine di ogni fase |

---

## 1. Panoramica progetto

**Finalità.** Una dashboard privata che riunisce in un solo posto conti, carte e investimenti, per capire *dove vanno i soldi*, *quanto entra*, *come rendono gli investimenti* e *quanto vale il patrimonio totale*.

**Utente.** Uno solo: il proprietario. Nessun concetto di multiutenza, ruoli, tenant o registrazione. Il modello dati non ha `user_id`.

**Perimetro del sistema.**
- Dentro: lettura movimenti e saldi da Crédit Agricole Italia e Revolut (Open Banking), lettura portafoglio da Trading 212 (API ufficiale), classificazione, analisi, budget, ricorrenze, patrimonio netto.
- Fuori: pagamenti, bonifici, ordini di trading, qualsiasi operazione dispositiva; gestione contanti (esclusa per scelta); dichiarazione dei redditi; previsioni finanziarie complesse.

**Funzionalità principali.** Elenco unificato dei movimenti; spese per categoria/sottocategoria con classificazione automatica e regole che "imparano" dalle correzioni; riconoscimento dei trasferimenti interni; entrate per tipologia; ricorrenze e abbonamenti; budget opzionali con alert; portafoglio Trading 212 con P/L e dividendi; patrimonio netto storico; stato delle sincronizzazioni.

**Funzionalità future possibili.** Previsione del saldo a fine mese basata sulle ricorrenze; notifiche push/email per alert budget e scadenza consensi; più broker o conti; report PDF mensile; obiettivi di risparmio; ripartizione del portafoglio per settore/paese.

**Locale vs VPS.**

| Aspetto | Fase locale | Futuro VPS privato |
|---|---|---|
| Accesso | `127.0.0.1` sul PC | Solo via VPN (Tailscale/WireGuard), mai porte aperte su Internet |
| Autenticazione | Non necessaria (solo loopback), ma già predisposta | Obbligatoria (password + sessione, opz. TOTP) |
| HTTPS | Non necessario | Reverse proxy (Caddy) con certificato |
| Sync | Quando il backend è acceso + pulsante "Sincronizza" | Scheduler sempre attivo |
| Backup | Dump locale cifrato + copia su disco esterno | Dump cifrato giornaliero + copia fuori dal server |
| Consensi PSD2 | Redirect su `localhost` | Redirect sull'host privato |

Il codice è lo stesso nei due casi: cambiano solo configurazione (`.env`) e infrastruttura.

---

## 2. Requisiti funzionali

**RF-1 Movimenti.** Elenco completo di tutti i movimenti di tutti i conti/carte, con ricerca testuale, filtri (periodo, conto, tipo, categoria, sottocategoria, tag, merchant, importo, stato pending/contabilizzato, "da classificare"), ordinamento, paginazione, modifica manuale di categoria/sottocategoria/tipo/tag/note.

**RF-2 Tipo di movimento.** Ogni movimento ha un *tipo* che determina come entra nei calcoli:
`expense` (spesa reale), `income` (entrata), `internal_transfer` (trasferimento tra conti miei), `investment_transfer` (verso/da Trading 212), `refund` (rimborso di una spesa), `fee` (commissione), `other`.

**RF-3 Trasferimenti interni.** Riconosciuti automaticamente e abbinati in coppia (uscita su un conto ↔ entrata sull'altro). Non contano né come spesa né come entrata. Esempio: 10 € da CA a Revolut = trasferimento interno; 5 € spesi con Revolut = spesa reale.

**RF-4 Spese.** Categorie e sottocategorie personalizzabili; classificazione automatica; correzione manuale; regole che si creano dalle correzioni; grafici per categoria/sottocategoria; mese corrente vs precedente; trend 3/6/12 mesi; analisi per merchant; ricorrenze; budget facoltativi per categoria.

**RF-5 Entrate.** Classificazione automatica per tipologia (stipendio, bonifico ricevuto, rimborso, cashback, interessi, altro), correzione manuale, analisi temporale, confronto entrate vs spese e tasso di risparmio.

**RF-6 Ricorrenze.** Rilevamento automatico di abbonamenti, spese ed entrate periodiche, con frequenza stimata, importo atteso e prossima data; conferma/correzione/rifiuto manuale.

**RF-7 Budget.** Budget mensile manuale per categoria o sottocategoria, solo dove serve; speso vs budget; alert al 80% e al 100%.

**RF-8 Investimenti.** Capitale investito, liquidità nel broker, valore attuale, P/L assoluto e percentuale, P/L realizzato e non realizzato, posizioni aperte, andamento storico, dividendi, depositi/prelievi.

**RF-9 Patrimonio.** Vista unificata: saldi dei conti + valore Trading 212, con storico giornaliero.

**RF-10 Sync e connessioni.** Stato di ogni connessione, ultima sincronizzazione, errori, scadenza dei consensi PSD2 con preavviso, sincronizzazione manuale.

**RF-11 Inserimento manuale.** Form per aggiungere movimenti a mano (pensato per l'eventuale carta di credito CA non disponibile via PSD2).

---

## 3. Requisiti tecnici

- **Ambiente:** Windows 11, setup nativo (niente Docker, niente WSL), tutto su D:.
- **Read-only:** nessun endpoint, client o permesso che consenta operazioni dispositive. Le chiavi vengono create con i soli permessi di lettura e il codice dei client espone solo metodi `GET`.
- **Rete:** backend e database ascoltano solo su `127.0.0.1`.
- **Importi:** mai `float`. `NUMERIC(14,2)` in DB, `Decimal` in Python, stringhe nel JSON verso il frontend.
- **Valute:** ogni movimento conserva importo e valuta originali più il controvalore in EUR.
- **Idempotenza:** risincronizzare lo stesso periodo non crea duplicati.
- **Correzioni manuali persistenti:** una sincronizzazione non sovrascrive mai ciò che ho corretto a mano.
- **Tracciabilità:** si conserva il dato grezzo del provider (`raw` JSONB) e il motivo di ogni classificazione (regola, manuale, automatica).
- **Portabilità:** stessa base di codice in locale e su VPS; configurazione solo via variabili d'ambiente.
- **Limiti PSD2:** al massimo 4 accessi al giorno per conto senza che io sia presente; il consenso dura fino a 180 giorni e poi va rinnovato.
- **Qualità:** tipizzazione statica (mypy, TypeScript strict), lint e format automatici, test automatici su logica di calcolo e classificazione.
- **Fuso e date:** date contabili come `DATE`; timestamp in UTC; visualizzazione in Europe/Rome.

---

## 4. Stack consigliato

| Livello | Scelta | Note |
|---|---|---|
| Backend | **Python 3.12 + FastAPI** | API REST tipizzate, documentazione OpenAPI automatica |
| ORM / migrazioni | **SQLAlchemy 2 + Alembic** | Schema versionato, identico in locale e su VPS |
| Driver DB | **psycopg 3** | |
| Validazione / config | **Pydantic v2 + pydantic-settings** | Legge `.env` e variabili d'ambiente |
| HTTP client | **httpx** | Usato dai connettori, con timeout e retry |
| Scheduler | **APScheduler** (dentro il processo backend) | Niente Celery/Redis: per un utente sarebbe eccessivo |
| Database | **PostgreSQL** (ultima stabile) nativo | JSONB, `NUMERIC`, ricerca full-text, stesso DB del VPS |
| Frontend | **React + TypeScript + Vite** | |
| Routing / dati | **React Router + TanStack Query** | Cache e refetch delle API |
| Tabelle | **TanStack Table** | Filtri, ordinamento, virtualizzazione per migliaia di righe |
| UI | **Tailwind CSS + shadcn/ui** | Componenti accessibili, responsive per il futuro uso da telefono |
| Grafici | **Recharts** | Semplice, sufficiente per barre/linee/torte/area; ECharts come alternativa se servisse di più |
| Segreti | File fuori dal repo in `D:\FinanceData\secrets\` + token cifrati in DB (Fernet) | Vedi §15 |
| Auth | Nessuna in locale (solo loopback); in Fase 10 password (argon2) + cookie di sessione `HttpOnly` | |
| Tooling Python | **uv**, ruff, mypy, pytest | uv gestisce venv e lockfile |
| Tooling frontend | **pnpm**, ESLint, Prettier, Vitest, (Playwright opzionale) | |

**Perché questo stack.** Python è il linguaggio più comodo per la logica dati (classificazione, ricorrenze, calcoli sul portafoglio) e per i client delle API finanziarie. FastAPI dà un'API pulita e tipizzata. React + TanStack Table è la combinazione più solida per tabelle grandi e filtrabili, che sono il cuore della dashboard. PostgreSQL è lo stesso database che useremo sul VPS.

**Vantaggi.** Tutto open source e gratuito; strumenti già installati sul PC; nessun servizio esterno oltre ai provider dei dati; architettura frontend/backend separata già pronta per il VPS.

**Svantaggi.** Due linguaggi (Python + TypeScript); PostgreSQL va installato e gestito come servizio Windows; più componenti rispetto a una soluzione "tutto in uno".

**Alternative valutate.**
- *Full-stack TypeScript (Next.js + Prisma):* un solo linguaggio, ma la logica dati e i calcoli finanziari sono meno comodi.
- *Streamlit / Dash:* velocissimo per i prototipi, ma limitato per UI ricche, tabelle editabili e uso da telefono.
- *SQLite:* zero installazione, ma andrebbe migrato a Postgres per il VPS.
- *Firefly III / Actual Budget (self-hosted):* esistono già, ma imporrebbero il loro modello dati e non coprono bene Trading 212.

**Docker Desktop: no.** Con 12 GB liberi su C:, Docker Desktop + WSL2 occuperebbe spazio prezioso e aggiungerebbe complessità. Il setup nativo è sufficiente in locale. Il `Dockerfile` e il `docker-compose.yml` verranno scritti in Fase 10 per il VPS (Linux), dove Docker è nativo.

---

## 5. Setup ambiente Windows

**Stato attuale del PC (verificato il 2026-10-04):**

| Software | Stato |
|---|---|
| Python 3.12.10 | ✅ installato |
| uv 0.12 | ✅ installato |
| Node.js 24 + npm 11 | ✅ installato |
| pnpm 12 | ✅ installato |
| Git 2.55 | ✅ installato |
| VS Code 1.140 | ✅ installato |
| PostgreSQL | ❌ da installare (Fase 0) |
| Docker | — non serve |

**Ordine di installazione (per riferimento):** Git → VS Code → Python + uv → Node.js + pnpm → PostgreSQL. Manca solo PostgreSQL.

**Terminale.** **PowerShell 7** come terminale principale (anche in VS Code). Git Bash va bene per comandi Git occasionali. **Niente WSL**: non serve e occuperebbe spazio su C:. CMD da evitare.

**PostgreSQL.**
- Installer ufficiale EDB per Windows, ultima versione stabile.
- Cartella programma: `D:\Programs\PostgreSQL\<versione>`
- Cartella dati: `D:\FinanceData\pgdata` (dati finanziari tutti nello stesso posto, fuori dal repo)
- Porta 5432, servizio Windows in avvio automatico
- `listen_addresses = 'localhost'`
- Componenti: server + command line tools (pgAdmin opzionale, Stack Builder no)
- Due database: `finance` (dati veri) e `finance_test` (test automatici), con un utente applicativo dedicato `finance_app` (non il superuser `postgres`)

**Backend (Python).**
- `uv` crea e gestisce `backend\.venv` e `uv.lock`; non serve attivare il venv a mano: `uv run <comando>`.
- Dipendenze in `backend\pyproject.toml`.

**Frontend.**
- `pnpm` come unico package manager (`pnpm-lock.yaml` versionato, niente `package-lock.json`).

**File `.env`.**
- `.env.example` nel repo (solo nomi di variabili, nessun valore reale).
- `.env` vero in `backend\.env`, ignorato da Git; contiene percorsi e configurazione, **non** le chiavi API.
- Chiavi e certificati in `D:\FinanceData\secrets\` (vedi §15).

**Convenzioni Windows.**
- Fine riga LF ovunque (`.gitattributes` con `* text=auto eol=lf`).
- Encoding UTF-8.
- Niente spazi nei percorsi del progetto.
- Script di sviluppo in PowerShell (`scripts\*.ps1`).
- Percorsi sempre da configurazione (`DATA_DIR`), mai scritti nel codice.

---

## 6. Configurazione VS Code

**Workspace unico:** `finance-dashboard.code-workspace` con tre cartelle: `backend`, `frontend` e la radice (`docs`, `scripts`, `config`).

**Estensioni consigliate** (in `.vscode/extensions.json`):

| Estensione | Uso |
|---|---|
| `ms-python.python`, `ms-python.vscode-pylance` | Python, IntelliSense |
| `ms-python.debugpy` | Debug backend |
| `charliermarsh.ruff` | Lint + format Python |
| `ms-python.mypy-type-checker` | Type checking |
| `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode` | Lint + format TS |
| `bradlc.vscode-tailwindcss` | Tailwind |
| `vitest.explorer` | Test frontend |
| `ms-ossdata.vscode-pgsql` | Client PostgreSQL integrato |
| `mikestead.dotenv` | Evidenziazione `.env` |
| `tamasfe.even-better-toml`, `redhat.vscode-yaml` | TOML / YAML |
| `usernamehw.errorlens` | Errori inline |
| `editorconfig.editorconfig` | Coerenza formattazione |

**Impostazioni workspace principali:**
- `editor.formatOnSave: true`; Ruff come formatter Python, Prettier per TS/JSON/CSS
- `editor.codeActionsOnSave`: organizza import e fix Ruff/ESLint
- `python.defaultInterpreterPath`: `backend/.venv/Scripts/python.exe`
- `typescript.tsdk`: `frontend/node_modules/typescript/lib`
- `files.eol: "\n"`
- `terminal.integrated.defaultProfile.windows: "PowerShell"`
- `files.exclude` / `search.exclude`: `.venv`, `node_modules`, `dist`, `.mypy_cache`, `.ruff_cache`

**Debug (`.vscode/launch.json`):**
- *Backend:* debugpy che lancia `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
- *Frontend:* Edge/Chrome su `http://localhost:5173`
- *Compound "Full stack":* avvia entrambi

**Task (`.vscode/tasks.json`):** `dev:backend`, `dev:frontend`, `test`, `lint`, `db:migrate`, `db:seed-mock`, `backup`.

**Privacy in VS Code:** disattivare la telemetria (`telemetry.telemetryLevel: "off"`); se usi Settings Sync, non sincronizzare nulla che contenga dati; non aprire `D:\FinanceData` come cartella del workspace.

---

## 7. Struttura cartelle

### Repository — `D:\Projects\finance-dashboard`

```
finance-dashboard/
├─ backend/
│  ├─ app/
│  │  ├─ main.py               # crea l'app FastAPI, router, CORS, scheduler
│  │  ├─ core/                 # config (pydantic-settings), logging, sicurezza, cifratura token
│  │  ├─ db/                   # engine, sessione, base dichiarativa
│  │  ├─ models/               # modelli SQLAlchemy (uno per entità)
│  │  ├─ schemas/              # schemi Pydantic per input/output API
│  │  ├─ api/                  # router REST: transactions, expenses, income, investments, ...
│  │  ├─ services/             # logica: classificazione, transfer matching, ricorrenze, budget, net worth
│  │  ├─ integrations/
│  │  │  ├─ base.py            # interfacce comuni dei connettori (solo metodi di lettura)
│  │  │  ├─ mock/              # connettore finto per sviluppo
│  │  │  ├─ enablebanking/     # Open Banking: CA Italia, Revolut
│  │  │  └─ trading212/        # API ufficiale Trading 212
│  │  ├─ ingestion/            # normalizzazione → deduplica → classificazione → salvataggio
│  │  └─ jobs/                 # job APScheduler (sync, snapshot, ricorrenze)
│  ├─ alembic/                 # migrazioni dello schema
│  ├─ tests/                   # pytest (unit + integrazione su finance_test)
│  ├─ pyproject.toml / uv.lock
│  └─ .env                     # NON versionato
├─ frontend/
│  ├─ src/
│  │  ├─ pages/                # Overview, Transactions, Expenses, Income, Investments, NetWorth, Budgets, Rules, Settings
│  │  ├─ components/           # UI riusabile (tabelle, card KPI, grafici, filtri)
│  │  ├─ features/             # logica per dominio (hook, query, form)
│  │  ├─ api/                  # client tipizzato generato da OpenAPI
│  │  └─ lib/                  # formattazione importi/date, utilità
│  ├─ tests/
│  └─ package.json / pnpm-lock.yaml / vite.config.ts
├─ database/
│  ├─ seeds/                   # categorie, sottocategorie, regole iniziali (YAML)
│  └─ README.md                # schema ER, convenzioni
├─ config/
│  └─ .env.example             # elenco variabili, senza valori reali
├─ scripts/                    # PowerShell: dev.ps1, backup.ps1, restore.ps1, seed-mock.ps1, check-secrets.ps1
├─ tests/
│  └─ e2e/                     # test end-to-end (opzionali, Playwright)
├─ docs/
│  ├─ SPEC.md                  # questo documento
│  ├─ decisions/               # ADR: una decisione architetturale per file
│  └─ integrations/            # note pratiche per Enable Banking e Trading 212
├─ .vscode/                    # settings, extensions, launch, tasks
├─ finance-dashboard.code-workspace
├─ .gitignore / .gitattributes / .editorconfig
└─ README.md
```

### Dati — `D:\FinanceData` (fuori dal repo, mai in Git)

```
D:\FinanceData\
├─ pgdata\     # cluster PostgreSQL
├─ secrets\    # chiave Trading 212, chiave privata Enable Banking, chiave di cifratura (permessi NTFS solo per il mio utente)
├─ backups\    # dump cifrati del database
├─ exports\    # export generati dalla dashboard (report)
├─ imports\    # vuota; usata solo come ultima risorsa per la carta di credito CA
└─ logs\       # log applicativi (senza dati sensibili in chiaro)
```

La richiesta originale prevedeva `data/imports` e `data/exports` nel repo: sono stati spostati in `D:\FinanceData` per tenere i dati fuori da Git.

---

## 8. Strategia integrazione dati

**Principio:** tutti i connettori implementano la stessa interfaccia di sola lettura (`list_accounts`, `get_balances`, `get_transactions(since)`, e per il broker `get_positions`, `get_cash`, `get_history`). Il connettore **mock** implementa la stessa interfaccia: così tutto il resto si sviluppa e si testa senza dati veri.

### Crédit Agricole Italia

| | |
|---|---|
| Dati ottenibili | Conti correnti: saldi, movimenti contabilizzati (e spesso pending), descrizione, controparte/IBAN, date. Carta di debito: i movimenti compaiono sul conto. **Carta di credito: probabilmente non esposta via PSD2** — da verificare |
| Difficoltà | Media (consenso con SCA tramite app CA, rinnovo ogni 180 giorni) |
| Fase iniziale | Dati mock generati |
| Fase successiva | Enable Banking (AIS read-only) in Fase 8 |
| Collegamento diretto alla banca? | **No.** Le API PSD2 della banca sono accessibili solo a TPP autorizzati (licenza AISP + certificati eIDAS). Un privato deve passare da un provider autorizzato |
| Rischi | Consenso scaduto; descrizioni dei movimenti poco strutturate; carta di credito non disponibile; modifiche delle API della banca |
| Dati minimi | ID movimento del provider, data contabile e valuta, importo con segno, valuta, descrizione, controparte, IBAN controparte se presente, stato, saldo |
| Ripiego carta di credito | 1) Inserimento manuale dal form; 2) solo come ultima risorsa, import del file estratto conto |

### Revolut

| | |
|---|---|
| Dati ottenibili | Conti per valuta, saldi, movimenti con merchant, controparte, importo e valuta originali |
| Difficoltà | Media-bassa |
| Fase iniziale | Dati mock |
| Fase successiva | Enable Banking (Revolut è tra le banche supportate) |
| API diretta? | **No.** Revolut ha API pubbliche solo per Revolut Business; per i conti personali c'è solo l'Open Banking tramite provider |
| Rischi | Consenso a 180 giorni; i "pocket"/salvadanai potrebbero comparire come conti separati o come trasferimenti; movimenti in valuta estera |
| Dati minimi | Come CA, più valuta originale e cambio |

### Trading 212 (Invest)

| | |
|---|---|
| Dati ottenibili | Liquidità (libera, investita, totale), posizioni aperte (quantità, prezzo medio, prezzo attuale, P/L), storico ordini, dividendi, depositi/prelievi |
| Difficoltà | Bassa: API ufficiale con chiave |
| Fase iniziale | Mock, poi l'ambiente **demo** di Trading 212 per testare il client |
| Fase successiva | API live con chiave read-only (Fase 7) |
| Rischi | API ufficialmente in beta (v0) e soggetta a cambiamenti; limiti di frequenza per endpoint; i CFD non sono coperti (non ti riguarda) |
| Dati minimi | Snapshot giornaliero di cash e posizioni, storico ordini eseguiti, dividendi, depositi/prelievi |

### Provider Open Banking: Enable Banking

- Offre gratuitamente l'accesso "Restricted Production" a dati reali, **limitato ai conti che colleghi tu stesso**: esattamente il nostro caso.
- GoCardless Bank Account Data, l'alternativa gratuita più usata, non accetta nuove registrazioni da luglio 2025.
- Alternative a pagamento o solo per aziende (Tink, TrueLayer, Salt Edge) non sono adatte a un privato.

### Note di implementazione (Fase 4)
- **Interfacce comuni** di sola lettura per banca (`list_accounts`, `get_balances`, `get_transactions`) e broker (`get_account`, `get_cash`, `get_positions`, `get_orders`, `get_dividends`, `get_cash_flows`); un test verifica che i connettori non espongano metodi di scrittura.
- **Pipeline** normalizza → deduplica → salva, con promozione pending → booked (stesso conto e importo, entro 5 giorni), rimozione dei pending annullati (salvo correzioni manuali), aggiornamento dei soli campi del provider.
- **Dati di prova** deterministici dal 1° luglio 2025, sorgenti con provider `mock` (Crédit Agricole: conto + carta di credito; Revolut; Trading 212). Rimovibili con `mock-remove`.
- **Classificazione**: in questa fase il tipo viene dedotto dal segno (uscita → spesa, entrata → entrata); categorie, trasferimenti interni e investimenti arrivano con la Fase 5.
- **Sincronizzazione** manuale da Impostazioni o da terminale; lo scheduler automatico arriverà quando ci saranno i connettori veri (Fasi 7–8).
- **Saldi**: un saldo per conto e giorno; per il broker il valore del conto (liquidità + posizioni), che servirà al patrimonio netto.

**Frequenza di sync.** Banche: massimo 4 volte al giorno per conto (limite PSD2 senza utente presente); default 2 volte al giorno più sync manuale. Trading 212: snapshot ogni ora negli orari di mercato più uno giornaliero.

---

## 9. Come ottenere API e accessi

### Trading 212 — chiave API read-only (Fase 7)

**Prerequisiti:** conto Invest attivo; app o web Trading 212.

**Passaggi:**
1. *(Facoltativo, consigliato)* Prima prova sull'account **Practice/Demo**: crea lì una chiave e usala per sviluppare il client (`https://demo.trading212.com`).
2. Account **Live** → Impostazioni → **API** → *Genera chiave API*.
3. Assegna un nome riconoscibile, es. `finance-dashboard-readonly`.
4. **Permessi da spuntare (solo lettura):**
   - ✅ Account data
   - ✅ Metadata
   - ✅ Portfolio
   - ✅ History (ordini, dividendi, transazioni)
   - ✅ Orders **read** (solo se necessario: serve a vedere gli ordini pendenti, non a crearli)
   - ✅ Pies **read** (solo se usi le Pie)
5. **Permessi da NON spuntare mai:**
   - ❌ Orders **execute** / write — permetterebbe di comprare e vendere
   - ❌ Pies **write** — permetterebbe di creare, modificare o cancellare Pie
   - ❌ qualsiasi altra voce con "execute", "write", "create", "delete" o "cancel"
6. **Restrizione IP:** se l'IP pubblico di casa è stabile, limita la chiave a quell'IP. Sul VPS si limiterà all'IP del server.
7. Copia **API key** e **API secret**: il secret viene mostrato **una sola volta**. Salvali subito in `D:\FinanceData\secrets\trading212.env` (vedi §15).

L'autenticazione è HTTP Basic con `Base64(API_KEY:API_SECRET)`. Permessi effettivamente usati e collegamento: vedi §13 "Note di implementazione (Fase 7)".

**Come verificare che la chiave sia davvero read-only:**
- Nella schermata della chiave controlla che risultino attive solo le voci di lettura.
- Test automatico in Fase 7: con la chiave **demo**, una richiesta di creazione ordine deve essere rifiutata con errore `401`/`403` (permesso mancante). Il test va fatto **solo sull'ambiente demo**, mai sul live.
- Doppia protezione nel codice: il client Trading 212 non contiene alcun metodo di scrittura e accetta solo richieste `GET`; un test lo verifica.

### Enable Banking — Crédit Agricole Italia e Revolut (Fase 8)

**Prerequisiti:** e-mail, app Crédit Agricole e app Revolut sul telefono per l'autenticazione forte (SCA).

**Passaggi:**
1. Registrazione al Control Panel di Enable Banking (enablebanking.com).
2. Creazione di un'applicazione in ambiente **Sandbox** per lo sviluppo (banche finte).
3. Il Control Panel genera una coppia di chiavi: la **chiave privata** (`.pem`) va in `D:\FinanceData\secrets\` e non va mai condivisa; l'app viene identificata da un *application ID*.
4. Configurazione del **redirect URL** (in locale `localhost`; da verificare quali formati sono accettati).
5. Creazione di un'applicazione **Production** e collegamento dei *propri* conti → accesso "Restricted Production" gratuito.
6. Per ogni banca: la dashboard avvia l'autorizzazione → reindirizzamento alla banca → login e SCA con l'app della banca → ritorno alla dashboard con la sessione attiva.
7. **Permessi:** solo **AIS** (Account Information): saldi, dettagli conto, movimenti. **Non** attivare PIS (Payment Initiation), che serve a disporre pagamenti.
8. Validità del consenso: fino a 180 giorni; la dashboard mostra la scadenza e avvisa 14 giorni prima.

Ogni richiesta all'API viene firmata con un token JWT generato dalla chiave privata. Nessuna password bancaria passa mai dalla dashboard.

### Note di implementazione (Fase 8, parte 1 — Sandbox, 2026-10-06)

- **Attenzione:** sul sito di Enable Banking esiste anche un servizio *a pagamento* di esportazione una tantum dei dati (circa 1,50 €, file JSON/PDF/CSV). **Non serve e non va usato.** La dashboard usa il Control Panel per sviluppatori (`enablebanking.com/cp/applications`), gratuito; i conti veri si collegano con la modalità *restricted* («Activate by linking accounts»).
- **Credenziali:** applicazione Sandbox registrata; in `${DATA_DIR}/secrets/` ci sono `enablebanking.env` (`EB_APPLICATION_ID`, `EB_ENV`, `EB_KEY_FILE`) e la chiave `enablebanking.pem`. Redirect registrato in Sandbox: `http://localhost:5173/impostazioni/ritorno-banca`; dalla parte 2 il redirect è `https` (vedi sotto).
- **Cifratura:** sessioni e stato del consenso con Fernet; chiave `${DATA_DIR}/secrets/app.key`, creata al primo uso (permessi del solo utente). Perderla significa solo ricollegare le banche.
- **Client** (`backend/app/integrations/enablebanking/`): JWT RS256 (`kid` = application ID, massimo un'ora); elenco chiuso di endpoint: lettura di banche, conti, saldi e movimenti più avvio, creazione e revoca del consenso. Nessun endpoint di pagamento: i percorsi fuori elenco sono rifiutati prima di partire (test). Errori leggibili, senza IBAN né chiavi; 401/403 sui conti = consenso scaduto.
- **Traduzione:** conti identificati da `identification_hash` (stabile tra un consenso e l'altro), poi IBAN; saldo contabile da `CLBD` (o simili), disponibile da `ITAV`; importi sempre positivi con il verso in `credit_debit_indicator` (`DBIT` = uscita); `PDNG` = in sospeso; i movimenti annullati si ignorano.
- **Consenso:** «Collega una banca» in Impostazioni → pagina della banca (login e SCA) → ritorno su `/impostazioni/ritorno-banca` → sessione salvata cifrata e prima sincronizzazione. Lo stato del viaggio è cifrato e scade dopo 30 minuti. Validità richiesta: il massimo della banca (180 giorni). Avviso e «Rinnova consenso» da 14 giorni prima della scadenza; il rinnovo aggiorna la stessa sorgente e revoca la sessione vecchia. Consenso scaduto → stato «Consenso scaduto», non «Errore».
- **Scollega:** revoca il consenso; si sceglie se tenere conti e movimenti (sorgente disattivata) o eliminarli.
- **Limiti:** sincronizzazione automatica delle banche ogni `EB_AUTO_SYNC_HOURS` (6, il minimo = 4 letture al giorno); quelle col consenso scaduto si saltano. La sincronizzazione chiesta a mano passa le intestazioni `Psu-*` (utente presente); l'IP solo se pubblico.
- **Prova Sandbox** (Mock ASPSP) riuscita il 2026-10-06, poi scollegata con eliminazione dei dati.

### Note di implementazione (Fase 8, parte 2 — conti veri, 2026-10-06)

- **HTTPS in locale con mkcert.** Enable Banking in Production accetta solo redirect `https`, anche su `localhost`. mkcert (winget `FiloSottile.mkcert`) ha creato un'autorità locale con `CAROOT=${DATA_DIR}/secrets/mkcert` (variabile utente; la chiave `rootCA-key.pem` può firmare certificati validi su questo PC: resta nella cartella dei segreti) e il certificato `${DATA_DIR}/secrets/tls/localhost.pem` + `localhost-key.pem` per `localhost`, `127.0.0.1`, `::1` (scade il 2029-01-06; si rinnova con `mkcert -cert-file … -key-file … localhost 127.0.0.1 ::1`). Vite passa a https da solo se trova il certificato (`FD_TLS_DIR` per cambiarne la cartella, `FD_HTTPS=off` per spegnerlo); senza, resta http (test, CI). L'app si apre su **https://localhost:5173**. Redirect: `https://localhost:5173/impostazioni/ritorno-banca` (default di `EB_REDIRECT_URL`).
- **Applicazione Production** (modalità *restricted*, gratuita): chiave `${DATA_DIR}/secrets/enablebanking-prod.pem`, `EB_ENV=production` in `enablebanking.env`; l'app si attiva solo dopo «Activate by linking accounts» nel Control Panel (prima l'API risponde 403 «Application is not active»). Campi richiesti dal modulo: descrizione, e-mail per la protezione dei dati, URL di privacy e termini → pagine **/privacy** e **/termini** della dashboard (fuori dalla shell, senza dati).
- **Banche provate:** Crédit Agricole Italia (in Enable Banking si chiama «Credit Agricole Cariparma», *beta*) e Revolut. CA dà solo **90 giorni** di storico anche subito dopo il consenso; Revolut uno storico più lungo. Prima di collegare i conti veri i dati di prova si tolgono con `mock-remove`.
- **Nome del conto:** il campo `name` di Enable Banking è l'**intestatario**, non il conto: si usa `product`/`details`, altrimenti «Conto ‹banca› ··1234».
- **Saldo mostrato = disponibile** (comprende i pagamenti in sospeso, come nell'app della banca), altrimenti il contabile; `balance_type` nella risposta di `/api/accounts` e «disponibile/contabile al …» in Panoramica. Revolut manda solo il disponibile (`ITAV`), datato al giorno prima.
- **Movimenti in sospeso:** chiesti esplicitamente (`transaction_status=PDNG` e `HOLD`), entrambe le banche ne restituiscono zero: via Open Banking non arrivano. La pipeline li gestirebbe comunque.
- **Ritorno dalla banca:** lo spinner gira su un contenitore HTML (livello proprio) e compare con una dissolvenza ritardata di 300 ms, che nasconde lo scatto dovuto all'avvio dell'app dopo il caricamento completo della pagina.
- **Altro nella stessa fase:** eliminazione delle sottocategorie (`DELETE /api/subcategories/{id}` se non usata, altrimenti `POST …/merge` verso una sorella o «nessuna sottocategoria», con conteggio degli usi da `GET …/usage`); rinomina in linea uguale per categorie, sottocategorie e merchant; eliminazione definitiva delle ricorrenze («Elimina…»; se la serie continua può tornare come proposta).

### Conservazione credenziali

| Cosa | Dove |
|---|---|
| Chiave e secret Trading 212 | `D:\FinanceData\secrets\trading212.env` |
| Chiave privata Enable Banking | `D:\FinanceData\secrets\enablebanking.pem` (Sandbox), `enablebanking-prod.pem` (Production) |
| Autorità e certificato HTTPS locali (mkcert) | `D:\FinanceData\secrets\mkcert\`, `D:\FinanceData\secrets\tls\` |
| Token/sessioni restituiti dai provider | Nel DB, cifrati con Fernet |
| Chiave di cifratura Fernet | `D:\FinanceData\secrets\app.key` |

La cartella `secrets` ha permessi NTFS solo per il tuo utente Windows.

**Locale vs produzione:** chiavi separate. In locale: chiavi limitate all'IP di casa. Sul VPS: chiavi nuove, limitate all'IP del server, in un file con permessi `600` di proprietà dell'utente del servizio. Le chiavi locali vanno revocate quando non servono più.

---

## 10. Modello dati

Convenzioni: chiavi primarie `id BIGINT IDENTITY`; `created_at` / `updated_at TIMESTAMPTZ` su tutte le tabelle; importi `NUMERIC(14,2)`; valute `CHAR(3)` ISO 4217; enum come `TEXT` + `CHECK`. Legenda: **(R)** obbligatorio, *(O)* facoltativo.

### account_sources
Una connessione a un provider (una sessione Enable Banking, una chiave Trading 212, mock, manuale).
- `id`, `provider` **(R)** (`enablebanking` | `trading212` | `mock` | `manual`), `institution` **(R)** (es. "Crédit Agricole Italia"), `display_name` **(R)**, `status` **(R)** (`active` | `expired` | `error` | `disabled`), `consent_expires_at` *(O)*, `credentials_ref` *(O)* (riferimento al segreto, mai il segreto), `session_data_encrypted` *(O)*, `last_sync_at` *(O)*.
- Relazioni: 1→N `accounts`, 1→N `sync_logs`.

### accounts
Un conto o una carta.
- `id`, `source_id` → account_sources **(R)**, `external_id` **(R)**, `name` **(R)**, `type` **(R)** (`checking` | `savings` | `card` | `credit_card` | `broker`), `currency` **(R)**, `iban` *(O)*, `institution` **(R)**, `is_active` **(R)**, `include_in_net_worth` **(R)**, `color` *(O)*.
- Vincolo: `UNIQUE(source_id, external_id)`.
- Note: le carte di debito non sono conti separati (i movimenti stanno sul conto); la carta di credito sì.

### merchants
- `id`, `name` **(R)** (nome pulito), `normalized_key` **(R, UNIQUE)** (es. `amazon`), `aliases` *(O)* (array di pattern grezzi), `default_category_id` *(O)*, `default_subcategory_id` *(O)*, `logo_url` *(O)*.

### categories
- `id`, `name` **(R, UNIQUE)**, `kind` **(R)** (`expense` | `income` | `transfer` | `investment`), `icon` *(O)*, `color` *(O)*, `sort_order` *(O)*, `is_system` **(R)**, `excluded_from_spending` **(R)** (es. Investimenti, vedi §11).

### subcategories
- `id`, `category_id` → categories **(R)**, `name` **(R)**, `sort_order` *(O)*.
- Vincolo: `UNIQUE(category_id, name)`.

### transactions
Il cuore del sistema.
- **Identità:** `id`, `account_id` → accounts **(R)**, `external_id` *(O)*, `dedupe_hash` **(R)**; vincolo `UNIQUE(account_id, external_id)` e indice su `dedupe_hash`.
- **Date:** `booking_date` **(R)**, `value_date` *(O)*, `status` **(R)** (`pending` | `booked`).
- **Importi:** `amount` **(R)** (con segno: negativo = uscita), `currency` **(R)**, `amount_eur` **(R)**, `original_amount` *(O)*, `original_currency` *(O)*, `fx_rate` *(O)*.
- **Testo:** `description_raw` **(R)**, `description_clean` **(R)**, `counterparty_name` *(O)*, `counterparty_iban` *(O)*, `provider_category` *(O)*, `mcc` *(O)*.
- **Classificazione:** `merchant_id` *(O)*, `kind` **(R)** (`expense` | `income` | `internal_transfer` | `investment_transfer` | `refund` | `fee` | `other`), `category_id` *(O)*, `subcategory_id` *(O)*, `income_type` → income_classifications *(O)*, `classification_source` **(R)** (`manual` | `rule` | `merchant` | `provider` | `heuristic` | `none`), `rule_id` *(O)*.
- **Collegamenti:** `transfer_pair_id` → transactions *(O)*, `recurring_id` → recurring_transactions *(O)*, `refund_of_id` → transactions *(O)*.
- **Altro:** `notes` *(O)*, `is_manual` **(R)**, `raw` JSONB *(O)*.
- Indici: `(booking_date)`, `(account_id, booking_date)`, `(category_id)`, `(kind)`, `(merchant_id)`, full-text su `description_clean`.

### tags / transaction_tags
- `tags`: `id`, `name` **(R, UNIQUE)**, `color` *(O)*.
- `transaction_tags`: `transaction_id` **(R)**, `tag_id` **(R)**, `source` **(R)** (`manual` | `rule`); chiave primaria composta.

### transaction_rules
Regole di classificazione; le crei tu o nascono dalle tue correzioni.
- `id`, `name` **(R)**, `priority` **(R)** (numero più basso = valutata prima), `is_active` **(R)**, `origin` **(R)** (`seed` | `user` | `learned`).
- `conditions` JSONB **(R)**: combinazione in AND di `description_contains`, `description_regex`, `merchant_id`, `counterparty_iban`, `account_id`, `amount_min/max`, `direction` (in/out), `mcc`.
- `actions` JSONB **(R)**: `category_id`, `subcategory_id`, `kind`, `income_type`, `merchant_id`, `tag_ids`.
- `match_count` **(R)**, `last_matched_at` *(O)*.

### manual_overrides
Garantisce che le correzioni manuali sopravvivano a ogni sync e riclassificazione.
- `id`, `transaction_id` **(R)**, `field` **(R)** (`category_id`, `subcategory_id`, `kind`, `income_type`, `merchant_id`, `notes`, ...), `old_value` *(O)*, `new_value` **(R)**, `created_at` **(R)**.
- Vincolo: `UNIQUE(transaction_id, field)` (vale l'ultima correzione).

### balances
Saldi storici per conto.
- `id`, `account_id` **(R)**, `as_of` **(R)**, `balance` **(R)**, `currency` **(R)**, `balance_type` **(R)** (`booked` | `available`), `source` **(R)**.
- Vincolo: `UNIQUE(account_id, as_of, balance_type)`.

### budgets
- `id`, `category_id` **(R)**, `subcategory_id` *(O)*, `period` **(R)** (`monthly`; `yearly` opzionale), `amount` **(R)**, `valid_from` **(R)**, `valid_to` *(O)*, `alert_threshold_pct` **(R)** (default 80), `is_active` **(R)**.
- Le categorie senza riga in `budgets` semplicemente non hanno budget (es. Viaggi).

### recurring_transactions
- `id`, `name` **(R)**, `direction` **(R)** (`out` | `in`), `merchant_id` *(O)*, `category_id` *(O)*, `subcategory_id` *(O)*, `frequency` **(R)** (`weekly` | `monthly` | `quarterly` | `yearly` | `custom`), `interval_days` *(O)*, `expected_amount` **(R)**, `amount_tolerance_pct` **(R)**, `next_expected_date` *(O)*, `status` **(R)** (`suggested` | `confirmed` | `rejected` | `ended`), `confidence` *(O)*, `last_seen_date` *(O)*.

### income_classifications
Tipologie di entrata.
- `id`, `code` **(R, UNIQUE)** (`salary` | `transfer_received` | `refund` | `cashback` | `interest` | `dividend` | `other`), `label` **(R)**, `is_system` **(R)**.

### portfolios
- `id`, `account_id` → accounts (type `broker`) **(R)**, `name` **(R)**, `base_currency` **(R)**.

### positions
Snapshot delle posizioni (una riga per strumento per snapshot).
- `id`, `portfolio_id` **(R)**, `snapshot_at` **(R)**, `ticker` **(R)**, `isin` *(O)*, `name` *(O)*, `quantity` **(R)** (`NUMERIC(20,8)`), `avg_price` **(R)**, `current_price` **(R)**, `instrument_currency` **(R)**, `fx_rate` *(O)*, `cost_basis_eur` **(R)**, `market_value_eur` **(R)**, `unrealized_pl_eur` **(R)**.
- Tabelle di supporto: `portfolio_cash_snapshots` (liquidità libera/investita/totale per snapshot), `investment_orders` (ordini eseguiti, per il P/L realizzato), `investment_cash_flows` (depositi e prelievi).

### dividends
- `id`, `portfolio_id` **(R)**, `external_id` **(R, UNIQUE)**, `ticker` **(R)**, `paid_on` **(R)**, `quantity` *(O)*, `gross_per_share` *(O)*, `amount` **(R)**, `currency` **(R)**, `amount_eur` **(R)**, `withholding_tax` *(O)*.

### sync_logs
- `id`, `source_id` **(R)**, `job` **(R)** (`accounts` | `balances` | `transactions` | `portfolio` | `dividends` | ...), `started_at` **(R)**, `finished_at` *(O)*, `status` **(R)** (`running` | `success` | `partial` | `error`), `items_fetched` *(O)*, `items_created` *(O)*, `items_updated` *(O)*, `error_message` *(O)* (senza dati sensibili).

### net_worth_snapshots
- `id`, `snapshot_date` **(R, UNIQUE)**, `cash_total_eur` **(R)**, `investments_total_eur` **(R)**, `net_worth_eur` **(R)**, `breakdown` JSONB **(R)** (valori per conto).

### fx_rates (supporto)
- `date` **(R)**, `currency` **(R)**, `rate_to_eur` **(R)**, `source` **(R)** (es. BCE); chiave primaria `(date, currency)`.

### Note di implementazione (Fase 2)

Scelte prese scrivendo lo schema, rispetto all'elenco sopra:
- **`income_type` → `income_type_id`** in `transactions`, nelle azioni delle regole e in `manual_overrides.field`: è una FK, il suffisso `_id` la rende coerente con `category_id`.
- **`code`** (facoltativo, univoco) su `categories` e `subcategories`: chiave stabile per seed e logica applicativa (es. trovare "Investimenti" anche se rinominata).
- **`is_archived`** su `categories` e `subcategories`: implementa l'"archivia" del §11.
- **`manual_overrides.new_value` facoltativo**: svuotare un campo (es. togliere la sottocategoria) è anch'esso una correzione. Con più correzioni dello stesso campo, `old_value` conserva il valore originale e `new_value` l'ultimo.
- **Integrità sottocategoria/categoria** garantita dal database con FK composte (vedi `database/README.md`).
- **Tipi numerici:** prezzi unitari e quantità `NUMERIC(20,8)`, cambi `NUMERIC(20,10)`; importi sempre `NUMERIC(14,2)`.
- **Tabelle di supporto del portafoglio:** `portfolio_cash_snapshots` (`free`, `invested`, `total`, `unrealized_pl`), `investment_orders` (`side` buy/sell, `quantity`, `fill_price`, `value_eur`, `fees_eur`, `taxes_eur`), `investment_cash_flows` (`type` deposit/withdrawal, importo sempre positivo, `transaction_id` verso il movimento bancario `investment_transfer` abbinato).
- **`balances.as_of`** è una `DATE` (un saldo per conto, giorno e tipo).
- **Sicurezza API:** oltre a CORS, `TrustedHostMiddleware` accetta solo `Host` locali (`ALLOWED_HOSTS`), contro il DNS rebinding.
- **Fase 6:** `recurring_transactions` ha in più `match_key` (la controparte della serie) e `kind` (tipo dei suoi movimenti); su `budgets` un indice unico parziale ammette un solo budget aperto (`valid_to` nullo) per categoria/sottocategoria (migrazione `c3a8f1d2e4b7`).

---

## 11. Sezione spese

### Categorie e sottocategorie iniziali (seed modificabile)

| Categoria | Sottocategorie |
|---|---|
| Sport e palestra | — |
| Vestiti | — |
| Regali | — |
| Spesa | — |
| Abbonamenti | Software e AI · Musica · Cloud e archiviazione · Altri servizi |
| Uscite | — |
| Viaggi | — |
| Trasporti | Bus · Treno |
| Cura della persona | — |
| Istruzione | Libri · Tasse e corsi |
| Casa | — (affitto) |
| Investimenti | — (versamenti verso Trading 212) |
| Altro | — (spese varie, commissioni) |

Ogni categoria e sottocategoria si può rinominare, aggiungere, unire o archiviare dall'interfaccia.

**Investimenti.** I versamenti verso Trading 212 hanno tipo `investment_transfer`: appaiono nella categoria Investimenti, ma **non** vengono mai sommati alle "spese reali" (il denaro non è speso, è spostato). Nessun interruttore per includerli. Vengono invece conteggiati in un totale dedicato **"Spostati e investiti"** (versamenti netti verso Trading 212 nel periodo), visibile in Expenses e Overview. *Confermato il 2026-10-04.*

### Pipeline di classificazione (in ordine di priorità)

1. **Correzione manuale** (`manual_overrides`): vince sempre.
2. **Trasferimento interno:** abbinamento automatico (vedi sotto).
3. **Regole dell'utente** (`origin = user | learned`), per priorità.
4. **Regole di sistema** (`origin = seed`): es. "Apple.com/bill + importo ~0,99/2,99/9,99 → Abbonamenti/iCloud".
5. **Categoria predefinita del merchant.**
6. **Categoria del provider / MCC** (se disponibile).
7. Altrimenti: **Da classificare**, evidenziata nella UI.

La classificazione salva sempre `classification_source` e `rule_id`, così nella UI si vede *perché* un movimento ha quella categoria.

### Apprendimento tramite regole

Quando correggi la categoria di un movimento, la dashboard propone: *"Applicare 'Abbonamenti › AI' a tutti i movimenti di **OpenAI** (12 passati, e quelli futuri)?"* con tre scelte: solo questo / anche i passati / crea regola per il futuro. Se accetti nasce una regola `learned`, che puoi modificare o eliminare dalla pagina Regole. Le regole che non trovano corrispondenze da molto tempo vengono segnalate.

### Normalizzazione dei merchant

Pulizia della descrizione (rimozione di codici, date, città, prefissi tipo `PAGAMENTO POS`, `CARTA *1234`) → chiave normalizzata → merchant. Gli alias permettono di unire varianti ("AMZN Mktp", "Amazon.it").

### Trasferimenti interni

Due movimenti sono abbinati come trasferimento interno se:
- sono su **due conti diversi miei**;
- hanno **importi opposti** uguali (tolleranza 0 in EUR; per cambi valuta ±2%);
- le date distano **al massimo 3 giorni lavorativi**;
- e almeno uno di questi indizi è vero: l'IBAN della controparte è un mio conto; la descrizione contiene parole chiave ("Revolut", "Top-up", "Ricarica", "Giroconto", il mio nome); esiste una regola apposita.

Abbinamenti incerti → proposti nella UI per conferma. Esempio: CA −10 € "Ricarica Revolut" + Revolut +10 € "Top-up" → coppia `internal_transfer`; poi Revolut −5 € "Bar" → `expense`.

### Rimborsi

Un'entrata dallo stesso merchant di una spesa recente può essere collegata alla spesa (`refund_of_id`). In questo caso riduce la spesa netta della categoria invece di contare come entrata.

### Analisi

- Totale spese reali del periodo; spese per categoria e sottocategoria (barre e ciambella); drill-down categoria → sottocategoria → movimenti.
- **Mese corrente vs precedente** (allo stesso giorno del mese, per un confronto equo) per categoria, con variazione assoluta e %.
- **Trend 3/6/12 mesi:** barre impilate per mese, media mobile.
- **Merchant:** classifica per spesa, frequenza, importo medio, storico.
- **Ricorrenze:** totale mensile degli abbonamenti, prossimi addebiti.

### Budget

Budget mensile impostabile manualmente solo dove serve (categoria o sottocategoria); speso vs budget con barra di avanzamento; proiezione a fine mese; alert in-app all'80% e al 100% (e notifiche in futuro sul VPS). Le categorie senza budget (es. Viaggi) restano fuori dalla vista budget.

### Note di implementazione (Fase 5)

**Motore** (`backend/app/classification/`). La classificazione viene **ricalcolata da zero** su tutti i movimenti dopo ogni sincronizzazione (passo `classification` nei log) e dopo ogni modifica a regole, merchant o categorie: il risultato dipende solo da dati, regole e correzioni, mai dall'ordine delle sync. Su ~800 movimenti richiede meno di un secondo. Ogni movimento salva `classification_source`, `rule_id` e una nota leggibile (`classification_note`, es. "Codice MCC 5812", "Regola «…»"), mostrata nel dettaglio come "Perché". Comando manuale: `uv run python -m app.ingestion.cli classify`.

**Scelte rispetto al testo sopra:**
- **Correzioni.** Si correggono tipo, categoria/sottocategoria, tipologia di entrata, merchant e note; nuovi campi di `manual_overrides`: `transfer_pair_id` e `refund_of_id` (un valore = abbinamento manuale, `NULL` = "non abbinare mai"). I movimenti inseriti **e** classificati a mano non vengono mai toccati. Riscegliere il valore che c'era prima della correzione la annulla; «Ripristina la classificazione automatica» nel dettaglio del movimento toglie tutte le correzioni di classificazione (le note restano), anche sui movimenti inseriti a mano.
- **Trasferimenti.** Indizi: IBAN di un tuo conto, parole chiave (Revolut, Top-up, Ricarica, Giroconto, Saldo carta, Estratto conto, …, più `OWNER_NAMES` in `backend/.env`), regola con tipo "trasferimento interno". Una regola che imposta un **altro** tipo esclude il movimento dall'abbinamento. Un movimento verso l'IBAN di un tuo conto resta trasferimento interno anche se l'altro lato non c'è ancora (es. accredito del giorno dopo). Le proposte senza indizi si confermano o si scartano dalla pagina Regole.
- **Investimenti.** I bonifici verso Trading 212 vengono abbinati ai versamenti del broker (`investment_cash_flows.transaction_id`, stesso importo, ≤ 3 giorni lavorativi); in mancanza del broker vale la regola di sistema "trading 212".
- **Regole.** Importi in EUR **senza segno** (il verso lo dà `direction`); nuova condizione `amounts` (lista di importi esatti, es. iCloud 0,99 / 2,99 / 9,99 €). Vince la prima regola che corrisponde: prima le tue (per priorità), poi quelle di sistema. Le regole di sistema (`database/seeds/rules.yaml`, chiave `code`) si disattivano ma non si modificano né si eliminano. Una regola è "ferma" se da 180 giorni non classifica nulla (dopo 30 giorni dalla creazione).
- **Apprendimento.** Dopo una correzione: *solo questo* / *anche i passati* (stessa correzione manuale sui movimenti simili, senza regola) / *crea regola per il futuro* (regola `learned` sul merchant, o sull'IBAN della controparte, che vale per passati e futuri).
- **Merchant.** `merchants.origin`: `seed` (elenco in `database/seeds/merchants.yaml`, con alias e categoria predefinita), `auto` (creati dalla descrizione), `user` (modificati da te). Unire due merchant sposta movimenti, correzioni, regole e varianti del nome. `mock-remove` elimina anche i merchant `auto` rimasti senza movimenti e le regole imparate collegate.
- **MCC / categoria della banca** (`classification/provider_map.py`): l'MCC viene prima della categoria del provider perché più preciso.
- **"Altro" e "Da classificare" sono distinti** (la categoria del seed si chiamava "Altro / Da classificare"; separata il 2026-10-05). **Altro** è una categoria vera: spese varie e commissioni (canone, bollo: tipo `fee`, contano nelle spese reali). **Da classificare** non è una categoria ma lo stato dei movimenti senza categoria: nelle analisi è una voce a sé, nei filtri e nei KPI indica quelli che nessun passo ha riconosciuto (`classification_source = none`).
- **Rimborsi.** Entrata dallo stesso merchant di una spesa degli ultimi 90 giorni: con importo uguale, oppure minore se la descrizione dice "rimborso/refund/storno". Diventa `refund` con la categoria della spesa. Un rimborso senza spesa trovata resta un'entrata di tipologia "Rimborso".
- **Stipendio.** Stesso ordinante (IBAN o nome) in almeno 3 mesi diversi con importo entro ±15% della mediana, oppure parole chiave (regola di sistema).
- **Unione di categorie.** Movimenti, budget, ricorrenze, merchant, correzioni e regole passano alla destinazione; le sottocategorie confluiscono in quelle omonime o vengono ricreate.
- **Confronti.** "Mese corrente vs precedente" e, in generale, ogni periodo si confronta con lo stesso intervallo spostato indietro di tanti mesi quanti ne copre, fino allo stesso giorno. Medie 3/6/12 mesi sui mesi interi, ignorando quelli prima dei primi dati. "Abbonamenti al mese" = media della categoria Abbonamenti negli ultimi 3 mesi (dalla Fase 6 vale l'equivalente mensile degli abbonamenti confermati, se ce ne sono).
- **Grafici.** Il colore segue la categoria: le 7 con più spesa negli ultimi 12 mesi hanno un colore fisso, le altre confluiscono in "Altre". Ogni grafico ha legenda, tooltip e tabella dei dati.
- **Dati di prova.** Ogni movimento mock ha un'etichetta attesa (`MockTx.expect`, mai esposta dal connettore): il test di accuratezza misura il **98,8%** su 730 movimenti (soglia 90%); gli errori sono i regali di Natale comprati su Amazon, indistinguibili dai libri, e qualche viaggio senza sottocategoria.

### Note di implementazione (Fase 6)

**Ricorrenze** (`backend/app/recurring/`). Il rilevamento riparte da zero dopo ogni classificazione (sync, modifiche a regole, categorie, merchant o movimenti) ed è una funzione pura (`detection.py`), testata a parte:
- **Serie** = stessa controparte (merchant, altrimenti IBAN, nome o descrizione: `match_key`), stesso verso, importi entro ±10% (lo stesso merchant può avere più serie: Apple 0,99 € iCloud e 10,99 € Apple Music) e intervalli di 7, 14, ~30, ~91 o ~365 giorni con tolleranza (1, 2, 5, 10, 20 giorni). Minimo 3 occorrenze, 4 per settimanali e quindicinali, 2 per le annuali.
- **Tollerati:** un periodo saltato ogni tre al massimo; un movimento in più troppo vicino al precedente (acquisto occasionale dello stesso importo, resta fuori dalla serie). Dopo una pausa di oltre tre periodi conta solo la serie ripartita.
- **Niente falsi positivi da spesa variabile:** nella stessa fascia di importo e nello stesso periodo la serie deve essere almeno il 75% dei movimenti di quella controparte (tre spese al supermercato da ~45 € a un mese di distanza non sono un abbonamento se in mezzo ce ne sono altre dieci).
- **Considerati:** spese, commissioni, entrate e versamenti al broker; mai trasferimenti interni né rimborsi.
- **Data attesa:** sul giorno tipico del mese (un addebito anticipato al venerdì per il weekend conta per la data nominale; "fine mese" riconosciuto). Importo atteso = mediana degli ultimi tre.
- **Stati:** le *proposte* rispecchiano il rilevamento e spariscono se la serie non c'è più o è ferma da oltre un periodo e mezzo; *confermate*: nome, importo atteso, frequenza e tolleranza scelti da te non vengono mai sovrascritti, e ne fanno parte i movimenti della stessa controparte con importo entro la tolleranza; *rifiutate*: non vengono più proposte; *terminate*: congelate (se la serie riprende torna come nuova proposta). Correggere una proposta la conferma; "Annulla il rifiuto" cancella la decisione e la serie torna proposta. `transactions.recurring_id` collega i movimenti (filtro "Ricorrenza" in Movimenti).
- **In ritardo:** confermata il cui addebito atteso non è arrivato entro la tolleranza. I *prossimi addebiti* includono quelli appena scaduti e non ancora arrivati.
- **Dati mock:** riconosciute esattamente le 11 serie dello scenario (affitto, versamento mensile a Trading 212, palestra, ATM, OpenAI, Apple Music, spazio iCloud, Iliad, Netflix, canone del conto, stipendio); nessuna proposta per spesa, bar, caffè, barbiere (ogni 41 giorni), tasse universitarie, cashback (importi variabili).
- **"Abbonamenti al mese"** (pagina Spese) = equivalente mensile delle ricorrenze confermate nella categoria Abbonamenti; finché non ne confermi nessuna resta la media della categoria negli ultimi 3 mesi (la tessera dice quale delle due).

**Budget** (`backend/app/services/budgets.py`):
- Solo mensili (il periodo `yearly` dello schema resta inutilizzato); solo categorie di spesa (non Investimenti). Il budget di una categoria comprende le sue sottocategorie; si può avere anche quello di una sottocategoria, senza contarlo due volte nei totali.
- **Speso** = spese reali del mese come nella pagina Spese (i rimborsi riducono).
- **Versioni:** cambiare l'importo chiude il budget alla fine del mese scorso e ne apre uno dal mese corrente, così lo storico si confronta con il budget di allora; la soglia si cambia senza nuova versione. Rimuovere un budget lo toglie dal mese corrente in poi (se creato questo mese sparisce del tutto). Al massimo un budget aperto per voce (indice unico). Unire due categorie con un budget ciascuno somma gli importi.
- **Proiezione a fine mese** = speso + addebiti ricorrenti confermati ancora attesi nel mese + spesa variabile per i giorni rimanenti; il ritmo della spesa variabile mescola quello del mese e la media degli ultimi 3 mesi, pesando il mese in proporzione ai giorni trascorsi.
- **Avvisi in-app:** soglia (default 80%, scelta tra 50 e 100%) e 100%; inoltre "a questo ritmo lo superi" quando la proiezione supera il budget. Contatori nella barra laterale (avvisi budget, ricorrenze da confermare), elenco degli avvisi nella pagina Budget, riquadro in Panoramica.
- **Storico:** ultimi 6 mesi per budget (speso e budget di quel mese); si possono sfogliare i mesi passati, in sola lettura.

**Interfaccia:** pagina **Ricorrenze** (`/ricorrenze`, nuova, in Pianificazione): proposte da confermare (anche tutte insieme), uscite ed entrate confermate con equivalente mensile, prossimi 30 giorni, terminate e rifiutate. **Budget** (`/budget`). Prossimi addebiti anche in Spese, entrate attese in Entrate, budget e prossimi addebiti in Panoramica.

### Note di implementazione (Fase 8 — classificazione dei movimenti veri, 2026-10-06)

Con i movimenti veri, all'inizio la grande maggioranza delle spese restava senza categoria; dopo queste modifiche meno del 10%.
- **Causali Crédit Agricole:** `POS CARTA CA DEBIT VISA N. ****1234 DEL … C/O NEGOZIO CITTÀ PV ITA`: il merchant è dopo «C/O»; le sigle di provincia e di paese in coda non entrano nella chiave.
- **I tuoi soldi restano tuoi:** ricariche Revolut con Apple Pay (la carta CA tokenizzata ha altre ultime cifre), la stessa ricarica vista da CA (`AFT … Revolut`), cambi valuta e movimenti la cui controparte sei tu (`OWNER_NAMES`, nome e cognome in qualunque ordine; anche `PAYPAL*NOME COGNOME`) sono trasferimenti interni, anche se una regola generica direbbe altro.
- **Spese divise** (categoria nuova): bonifici tra persone su Revolut («From …», «To …», «Payment from …»): quelli ricevuti sono rimborsi (riducono le spese), quelli inviati spese. Il totale delle spese reali conta così solo la tua parte; la categoria può risultare negativa quando la spesa originale (es. la cena pagata con CA) sta in un'altra categoria. I bonifici CA a persone non hanno una regola: lo scopo varia, si correggono a mano.
- **Categorie nuove:** Bar e ristoranti (Uscite resta per discoteche, cinema, sale giochi), Salute, Cartoleria e tabacchi, Giochi, Spese divise; Trasporti → Monopattini e bici, Parcheggi; Viaggi → Cibo, Alloggio, Voli, Treni, Bus e metro, Visite e attrazioni; tipologie di entrata Contanti (versamenti) e Famiglia. 
- **Parole chiave** (regole di sistema: bar, gelateria, pizzeria, farmacia, tabacchi, cinema, hotel, museo, fioreria, …): una regola di sistema che dà solo la categoria **cede** alla categoria predefinita di un merchant noto (es. «DELIVEROO PIZZA» resta Uscite). Il seed ora aggiunge ai merchant del seed le varianti nuove e la sottocategoria se manca (mai nome o categoria scelti da te).
- **Viaggi automatici:** `HOME_PLACES` in `backend/.env` = i comuni di casa. Un pagamento con carta la cui causale indica un altro posto (estero, o in Italia senza nessuno dei tuoi comuni) va in **Viaggi**, nella sottocategoria corrispondente (bar/ristoranti/spesa → Cibo, bus → Bus e metro, uscite → Visite). Restano fuori: acquisti online (www, .com, numeri di telefono) e merchant che vendono a distanza (Amazon, Trenitalia, Deliveroo, …, la città è la sede), e categorie che non dipendono dal posto (Giochi, Abbonamenti, Casa, Istruzione, Sport e palestra, Regali, Spese divise, treni, monopattini, parcheggi). **Giorni di viaggio:** nei giorni con pagamenti fuori casa (più quelli in mezzo, se a ≤ 2 giorni) anche i pagamenti con carta senza città nella causale (Revolut, `bank_transaction_code = CARD_PAYMENT`) vanno in Viaggi. Le regole tue vincono sempre. I viaggi più vecchi dello storico della banca si sistemano con regole tue sui nomi dei posti.
- **Dati personali fuori dal repository:** nome (`OWNER_NAMES`) e comuni (`HOME_PLACES`) stanno solo in `backend/.env`; le regole su persone e negozi specifici sono regole tue nel DB, non nel seed. Nei test un fixture li svuota.
- **Accuratezza sui dati mock:** etichette attese aggiornate (bar → Bar e ristoranti, macchinette senza sottocategoria).

---

## 12. Sezione entrate

**Classificazione automatica:**

| Tipologia | Euristica |
|---|---|
| Stipendio | Bonifico in entrata ricorrente mensile dallo stesso ordinante, importo stabile (±15%), o regola dedicata |
| Bonifico ricevuto | Bonifico in entrata non ricorrente da terzi |
| Rimborso | Entrata da un merchant con spese precedenti, o descrizione "rimborso/refund/storno" |
| Cashback | Descrizioni tipo "cashback", "reward", importi piccoli da Revolut/circuiti |
| Interessi | Interessi dei conti risparmio |
| Dividendi | Restano in Investimenti (Trading 212), mostrati anche nelle entrate come voce separata |
| Altro | Default |

Ogni tipologia si può correggere a mano, e le correzioni generano regole come per le spese.

**Analisi:**
- entrate per mese e tipologia;
- entrate vs spese mese per mese, con saldo netto;
- **tasso di risparmio** = (entrate − spese reali) / entrate;
- media entrate 3/6/12 mesi;
- entrate ricorrenti attese nel mese.

---

## 13. Sezione investimenti

**Integrazione esclusivamente read-only**: chiave con soli permessi di lettura, client senza metodi di scrittura, nessun pulsante operativo nell'interfaccia.

### Dati mostrati

Capitale investito, liquidità disponibile, valore attuale, P/L assoluto e %, P/L realizzato e non realizzato, rendimento complessivo, posizioni aperte (quantità, prezzo medio, prezzo attuale, valore, P/L, peso %), andamento storico (valore vs capitale versato), dividendi (per mese, per titolo, totale annuo, yield sul costo), depositi/prelievi, ordini eseguiti.

### Formule (tutto convertito in EUR)

| Grandezza | Formula |
|---|---|
| **Capitale netto versato** (capitale investito) | Σ depositi − Σ prelievi verso/da Trading 212 |
| **Costo delle posizioni aperte** | Σ (quantità × prezzo medio di carico) |
| **Valore posizioni** | Σ (quantità × prezzo attuale × cambio) |
| **Valore attuale del conto** | Valore posizioni + liquidità |
| **P/L non realizzato** | Valore posizioni − costo delle posizioni aperte |
| **P/L realizzato** | Σ sulle vendite di (prezzo di vendita − prezzo medio di carico al momento della vendita) × quantità venduta − commissioni |
| **P/L totale** | Valore attuale del conto − capitale netto versato (= realizzato + non realizzato + dividendi − commissioni/tasse ± effetti cambio) |
| **Rendimento complessivo %** | P/L totale / capitale netto versato |
| **Rendimento annualizzato (money-weighted)** | XIRR dei flussi: depositi negativi, prelievi positivi, valore attuale come flusso finale |
| **Dividendi** | Σ dividendi netti ricevuti; yield sul costo = dividendi ultimi 12 mesi / costo posizioni |

Note:
- Trading 212 usa il metodo del **costo medio**: adottiamo lo stesso metodo per avere numeri coerenti con l'app.
- "Capitale investito" può voler dire due cose: *capitale netto versato* (flussi di denaro) oppure *costo delle posizioni aperte*. La UI le mostra entrambe con etichette chiare.
- Il rendimento semplice % è falsato da versamenti fatti in momenti diversi: per questo si mostra anche lo XIRR.

### Storico

Uno snapshot giornaliero (e orario durante le ore di mercato) di cash e posizioni alimenta il grafico storico. Lo storico precedente al primo collegamento si ricostruisce, dove possibile, dallo storico ordini e transazioni.

### Note di implementazione (Fase 7)

**Collegamento.** Chiave live di sola lettura con i permessi *Account data, Metadata, Portfolio, History, Pies (read)*; *Orders* spento (gli ordini eseguiti arrivano da History, gli ordini in attesa non servono). Chiave e secret stanno in `${DATA_DIR}/secrets/trading212.env` (`T212_API_KEY`, `T212_API_SECRET`, `T212_ENV=live|demo`); nel database la sorgente ha solo il riferimento `secrets:trading212.env`. Si collega da Impostazioni → Connessioni («Collega Trading 212») o con `uv run python -m app.ingestion.cli t212-setup`. L'API è gratuita per i conti Invest e Stocks ISA. Siamo passati direttamente alla chiave live: la prova "un ordine viene rifiutato" sul demo non è stata fatta (e non va mai fatta sul live). La sostituiscono i permessi della chiave e due test: il client ha solo metodi di lettura, ogni richiesta è un `GET` e i percorsi fuori da un elenco di endpoint di lettura vengono rifiutati prima di partire.

**Client** (`backend/app/integrations/trading212/`): API v0, HTTP Basic, solo `GET`. Rispetta i limiti di frequenza per endpoint (es. riepilogo 1 ogni 5 s, Pie 1 ogni 30 s, storico 20 al minuto) e, su `429`, aspetta `x-ratelimit-reset`. Lo storico è paginato a 50 elementi con `nextPagePath`, dal più recente, e ci si ferma alla data di partenza della sync. Gli errori sono leggibili e non contengono mai la chiave. Nei test una fixture automatica impedisce di usare il file vero delle credenziali.

**Traduzione dei dati** (verificata su un conto reale):
- il conto deve essere in EUR (l'API non gestisce i conti multivaluta);
- **liquidità** = disponibile + liquidità nelle Pie non ancora investita + riservata agli ordini;
- **posizioni**: costo e valore in EUR dal broker (`walletImpact`), quindi il costo resta ai cambi storici;
- **ordini**: una riga per esecuzione (`fill`), quantità positiva (il verso è `side`), commissioni = somma delle voci `taxes` (per esempio le commissioni di conversione valuta). Gli ordini annullati si ignorano;
- **movimenti di cassa**: `DEPOSIT`/`WITHDRAW` sono capitale versato; `INTEREST_ON_FREE_CASH`/`LENDING_INTEREST` (tipo `interest`) e `FEE` (tipo `fee`) fanno parte del rendimento. Nuovi tipi in `investment_cash_flows` (migrazione `4ae1e91f8493`);
- **Pie**: tabelle `pies` e `pie_instruments`, con lo stato attuale sostituito a ogni sync (passo `pies` nei log). Per ogni strumento: quota obiettivo e attuale, investito, valore e risultato. L'API delle Pie è segnata come *deprecata* da Trading 212 ma funziona.

**Controllo con i dati veri:** il valore del conto coincide al centesimo con `totalValue` di Trading 212. Il P/L non realizzato coincide. Il `totalCost` e il `currentValue` del riepilogo comprendono anche la **liquidità nelle Pie non ancora investita** (anche pochi centesimi: non è un arrotondamento): per questo la base investita della Pie e di «Solo attivi» è costo dei titoli + liquidità della Pie, come nell'app (verificato: coincide al centesimo con la base della Pie mostrata dall'app). Il `netValue` degli ordini **comprende già le commissioni** (la liquidità ricostruita da tutto lo storico coincide al centesimo con quella attuale): il costo medio si calcola quindi sui valori senza commissioni, e così coincide al centesimo col P/L realizzato del broker; le commissioni si sottraggono a parte. Per il realizzato si usa il dato del broker per ogni esecuzione (`walletImpact.realisedProfitLoss`, presente su tutte le vendite; la somma coincide col totale dell'app); il costo medio resta come ripiego.

**Rendimenti — scelte rispetto alle formule sopra:**
- Il **rendimento principale** è *sul capitale versato* (guadagno / capitale netto versato), non annualizzato: è quanto hai guadagnato su quello che hai messo, e i versamenti non lo fanno mai salire.
- L'**XIRR annuo** si mostra solo se affidabile: almeno 365 giorni dal primo versamento **e** capitale medio investito nel tempo almeno pari al 50% del capitale versato attuale. Se il capitale è rimasto quasi a zero per gran parte del periodo (versamenti concentrati negli ultimi mesi), l'XIRR annuo può risultare molte volte più alto del rendimento reale sul versato, la stessa distorsione dei rendimenti altissimi che l'app del broker mostra dopo un versamento: in quel caso non viene mostrato.
- Il **time-weighted return** non è calcolabile sul passato (servirebbe il valore del portafoglio a ogni versamento; l'API non fornisce lo storico dei prezzi). Con le istantanee giornaliere che si accumulano da ora si potrà aggiungere più avanti.
- **Scomposizione del guadagno**: non realizzato + realizzato + dividendi + interessi − commissioni + altro = guadagno totale. Sui dati reali "altro" risulta zero: lo scarto era interamente dovuto alle commissioni di conversione, che non entrano né nel costo delle posizioni né nel realizzato del broker.

**Storico:** il grafico mostra il capitale netto versato mese per mese e il valore del conto alle istantanee (una a ogni sincronizzazione), che si accumulano da quando il conto è collegato. La ricostruzione del valore passato è rimandata (§13 "Storico").

**Interfaccia:** pagina **Investimenti** (`/investimenti`):
- valore, capitale versato, guadagno totale, rendimento;
- posizioni ordinabili per peso o risultato (schede su telefono);
- scomposizione del guadagno con la spiegazione dei rendimenti;
- Pie con peso attuale e obiettivo;
- capitale versato e valore, dividendi per mese;
- attività: ordini, dividendi, versamenti.

Se esistono anche i dati di prova, un selettore sceglie il portafoglio (prima quello vero). Pulsante «Aggiorna» per sincronizzare.

**Data di inizio** (facoltativa). Colonna `portfolios.tracking_start` (migrazione `7d2c9b4e1f30`), modificabile dalla pagina (`PATCH /api/investments/{id}`, mai nel futuro; vuota = tutto lo storico). Quando c'è:
- versamenti, prelievi, interessi, commissioni, ordini e dividendi contano solo da quel giorno (ora italiana), anche nell'attività e nella serie mensile;
- il **saldo di partenza** (liquidità ricostruita dallo storico precedente + costo medio, senza commissioni, delle posizioni ancora aperte) vale come capitale versato il primo giorno, anche per l'XIRR e il capitale medio;
- il **P/L realizzato** conta solo le vendite dalla data di inizio (col costo medio di tutto lo storico).
Verifica su un conto reale: dalla data di inizio la scomposizione del guadagno torna al centesimo ("altro" = 0,00).

**Tutto / Solo attivi** (preferenza locale `fd-investment-scope`). «Tutto (dal …)»: tutti gli investimenti dalla data di inizio, anche già venduti, con dividendi, interessi e commissioni. «Solo attivi»: solo le posizioni in mano, valore − costo (blocco `active` del riepilogo), con la liquidità della Pie non ancora investita sia nel costo sia nel valore come fa Trading 212, quindi uguale alla Pie nell'app; le tessere e la scomposizione (per titolo) cambiano di conseguenza.

**Aggiornamento quasi in tempo reale:**
- con la pagina Investimenti aperta e visibile, ogni 15 s `POST /api/investments/{id}/live`: riepilogo del conto + posizioni (2 richieste), nuova istantanea, ricarica del riepilogo. Il backend lo concede al massimo ogni 10 s per portafoglio (più schede non moltiplicano le chiamate) e lo salta se è in corso una sincronizzazione; gli errori del broker non rompono la pagina (indicatore «tempo reale in pausa»);
- **sincronizzazione automatica** completa (ordini, dividendi, movimenti, Pie) in un thread del backend: controlla ogni minuto e sincronizza le sorgenti Trading 212 la cui ultima sincronizzazione o tentativo fallito è più vecchia di `T212_AUTO_SYNC_MINUTES` (default 10; 0 = spenta; sempre spenta nei test). Un riavvio non provoca sincronizzazioni se l'ultima è recente;
- un **lock per sorgente** impedisce che sincronizzazione (a mano o automatica) e aggiornamento leggero si sovrappongano; i client della stessa chiave condividono il ritmo delle chiamate per endpoint (`Pacer`), così restano nei limiti di Trading 212;
- **istantanee**: al massimo una per quarto d'ora; una nuova nello stesso quarto d'ora sostituisce la precedente.

---

## 14. UI e dashboard

Layout: sidebar a sinistra (da PC) che diventa barra di navigazione in basso (da telefono); selettore del periodo globale in alto; tema chiaro/scuro; importi formattati `it-IT` (`1.234,56 €`); valori sensibili oscurabili con un clic ("modalità privacy").

| Schermata | KPI | Grafici | Tabelle / componenti | Filtri e interazioni |
|---|---|---|---|---|
| **Overview** | Patrimonio netto, spese del mese vs mese precedente, entrate del mese, tasso di risparmio, valore portafoglio e P/L | Patrimonio 12 mesi (area), spese per categoria (ciambella) | Ultimi movimenti, budget a rischio, prossimi addebiti ricorrenti, movimenti da classificare, avvisi sync/consensi | Periodo; clic su un KPI → pagina di dettaglio |
| **Transactions** | Conteggio, totale entrate/uscite del filtro | — | Tabella virtualizzata: data, conto, descrizione, merchant, categoria, tipo, tag, importo | Ricerca, filtri avanzati salvabili, modifica inline, azioni multiple (categoria, tag, tipo), dettaglio con dato grezzo e motivo della classificazione, "crea regola da qui", form di inserimento manuale |
| **Expenses** | Spese reali del periodo, Δ vs mese precedente, media 3/6/12 mesi, abbonamenti/mese, "Spostati e investiti" (separato dalle spese) | Barre per categoria, ciambella, trend impilato mensile, confronto mese vs mese | Classifica categorie e merchant, ricorrenze | Drill-down categoria → sottocategoria → movimenti |
| **Income** | Entrate del periodo, per tipologia, tasso di risparmio | Entrate vs spese mensili, composizione per tipologia | Elenco entrate, ricorrenti attese | Correzione della tipologia |
| **Investments** | Valore attuale, capitale versato, P/L (realizzato/non), rendimento %, XIRR, liquidità, dividendi annui | Valore vs versato nel tempo, allocazione per titolo, dividendi per mese | Posizioni, ordini, dividendi, depositi/prelievi | Periodo; ordinamento per peso/P/L |
| **Net Worth** | Patrimonio attuale, Δ mese/anno | Area impilata per conto | Ripartizione per conto, storico snapshot | Includi/escludi conti |
| **Budgets** | Speso vs budget totale | Barre di avanzamento per categoria | Budget attivi, storico rispetto per mese | Crea/modifica/disattiva budget, soglia di alert |
| **Rules** | Regole attive, % movimenti classificati automaticamente | — | Elenco regole (priorità, condizioni, azioni, corrispondenze) | Crea/modifica/testa una regola sui movimenti esistenti con anteprima, riordina, disattiva |
| **Settings** | Stato connessioni, scadenza consensi | — | Connessioni, log di sync, categorie/sottocategorie, tag, merchant, preferenze | Sincronizza ora, rinnova consenso, gestisci categorie, backup manuale |

**Responsive.** Mobile-first con Tailwind; le tabelle su telefono diventano liste a card; grafici con larghezza fluida; target touch ≥ 44 px.

### Note di implementazione (Fase 3)
- **Indirizzi in italiano:** `/`, `/movimenti`, `/spese`, `/entrate`, `/investimenti`, `/patrimonio`, `/budget`, `/ricorrenze` (aggiunta in Fase 6), `/regole`, `/impostazioni`. Le pagine non ancora operative mostrano cosa conterranno e in quale fase arrivano.
- **Navigazione:** sidebar da 1024 px in su; sotto, barra in basso con Panoramica, Movimenti, Spese, Investimenti e un pannello "Altro" con le altre pagine, il tema e la privacy.
- **Periodo globale:** Mese corrente, Mese scorso, Ultimi 3/6/12 mesi (mese corrente incluso), Da inizio anno; calcolato nel fuso di Roma e ricordato tra le sessioni. L'intervallo personalizzato arriverà con le pagine che lo usano.
- **Modalità privacy:** sfoca importi e IBAN (passandoci sopra col mouse si vedono); tasto `P`. Gli IBAN sono comunque sempre mascherati.
- **Impostazioni:** tema, privacy, elenco di categorie e tipologie di entrata dal database (modifica da interfaccia in Fase 5).
- **Client API** generato dallo schema OpenAPI del backend (`pnpm api:generate`), senza bisogno del server acceso.
- **TypeScript 6.0:** la 7.0 (compilatore nativo) non è ancora supportata da typescript-eslint e openapi-typescript.
- **Grafici:** token di colore pronti (palette categoriale validata per daltonismo in chiaro e scuro, palette di stato riservata); i grafici veri arrivano dalla Fase 5.

---

## 15. Sicurezza e privacy

**File `.env` e segreti.**
- `.gitignore` include `.env`, `*.env`, `*.pem`, `*.key`, `secrets/`, dump e file di dati; nel repo esiste solo `config/.env.example` senza valori.
- I segreti stanno in `D:\FinanceData\secrets\`, fuori dal repo, con permessi NTFS solo per il tuo utente (`icacls` rimuove l'ereditarietà e gli altri utenti).
- Un **hook pre-commit** (gitleaks) blocca i commit che contengono chiavi o pattern sensibili; `scripts\check-secrets.ps1` fa lo stesso controllo a mano.
- I token di sessione dei provider sono cifrati in DB con Fernet; la chiave di cifratura è un file separato.
- Log senza segreti e senza dati personali in chiaro (IBAN mascherati, niente header di autenticazione).

**Separazione frontend/backend.**
- Il frontend non vede mai una chiave: parla solo con il backend su `/api`.
- In sviluppo il proxy di Vite inoltra `/api` a `127.0.0.1:8000`; CORS limitato alle origini locali.
- In produzione un solo dominio dietro reverse proxy (stessa origine, cookie `HttpOnly`, `SameSite=Strict`).

**Read-only by design (tre livelli).**
1. Permessi del provider: solo lettura (Trading 212 senza execute/write; Enable Banking solo AIS).
2. Codice: i client espongono solo metodi di lettura; un test fallisce se compare un metodo non-`GET` verso gli endpoint del broker.
3. UI: nessuna funzione dispositiva.

**Rete locale.** Backend su `127.0.0.1`, PostgreSQL con `listen_addresses = 'localhost'` e `pg_hba.conf` solo locale; utente DB applicativo con permessi minimi (non superuser).

**Cifratura del disco.** Windows 11 Home non ha BitLocker completo: verificare se è attiva la "Crittografia dispositivo" (copre solo l'unità di sistema). Per proteggere `D:\FinanceData` a riposo, opzione consigliata: un volume **VeraCrypt** montato solo quando serve. Da valutare in Fase 10.

**Backup.**
- `scripts\backup.ps1`: `pg_dump` in formato custom → archivio cifrato (7-Zip AES-256 o `age`) in `D:\FinanceData\backups\`.
- Rotazione: 7 giornalieri, 4 settimanali, 12 mensili.
- Copia periodica su disco esterno o cloud **solo se cifrata**.
- Il restore va provato davvero (Fase 10) su un database temporaneo.

**Preparazione al VPS.**
- Configurazione al 100% da variabili d'ambiente; nessun percorso Windows nel codice.
- Migrazioni Alembic → stesso schema su qualsiasi Postgres.
- In Fase 10: `Dockerfile` e `docker-compose.yml` (backend, frontend statico servito da Caddy, Postgres); accesso **solo via Tailscale/WireGuard**, nessuna porta pubblica oltre a SSH con chiave; firewall (ufw), fail2ban, aggiornamenti automatici; login con password + TOTP; chiavi API nuove limitate all'IP del server; migrazione dei dati con `pg_dump`/`pg_restore`.

---

## 16. Roadmap per fasi

Ogni fase termina con: test superati, checklist completata, riepilogo e **stop per la tua approvazione esplicita**.

### Fase 0 — Pianificazione e setup ambiente
- **Obiettivo:** specifica approvata, ambiente completo e verificato.
- **Output:** `docs/SPEC.md` approvato; PostgreSQL installato su D:; estensioni VS Code; struttura di `D:\FinanceData` completata.
- **Prerequisiti:** nessuno.
- **File/cartelle:** `docs/SPEC.md`; `D:\FinanceData\{pgdata,secrets,logs}`.
- **Dipendenze:** PostgreSQL.
- **Test:** `psql` si connette in locale; Postgres non raggiungibile da altri PC; tutti i tool rispondono con la versione attesa.
- **Completamento:** checklist della Fase 0 tutta spuntata.

### Fase 1 — Struttura progetto e repository
- **Obiettivo:** monorepo pronto, Git privato, tooling configurato.
- **Output:** struttura cartelle (§7), `git init`, `.gitignore`/`.gitattributes`/`.editorconfig`, workspace VS Code, pre-commit con gitleaks, README, ADR iniziali.
- **Prerequisiti:** Fase 0.
- **File:** radice, `.vscode/`, `config/.env.example`, `scripts/`, `docs/decisions/`.
- **Dipendenze:** pre-commit, gitleaks.
- **Test:** un finto segreto in un commit di prova viene bloccato; `git status` pulito; nessun file in `D:\FinanceData` tracciato.
- **Completamento:** primo commit locale; nessun remote configurato senza il tuo ok (eventuale remote solo privato).

### Fase 2 — Backend base + database
- **Obiettivo:** API FastAPI funzionante con schema completo.
- **Output:** app FastAPI, config, connessione DB, modelli SQLAlchemy di tutte le tabelle (§10), prima migrazione Alembic, seed di categorie/sottocategorie/tipologie di entrata, endpoint `/api/health` e CRUD di base (conti, categorie, movimenti).
- **Prerequisiti:** Fase 1.
- **File:** `backend/app/**`, `backend/alembic/**`, `database/seeds/**`, `backend/tests/**`.
- **Dipendenze:** fastapi, uvicorn, sqlalchemy, alembic, psycopg, pydantic-settings, httpx, pytest, ruff, mypy.
- **Test:** migrazione su DB vuoto e rollback; seed idempotente; test API; vincoli (no duplicati, importi `NUMERIC`).
- **Completamento:** `uv run pytest` verde; ruff e mypy puliti; documentazione OpenAPI su `/docs`.

### Fase 3 — Frontend base
- **Obiettivo:** scheletro dell'interfaccia collegato al backend.
- **Output:** Vite + React + TS strict, Tailwind + shadcn/ui, routing di tutte le pagine (vuote), layout responsive, client API tipizzato da OpenAPI, tema chiaro/scuro, formattazione `it-IT`.
- **Prerequisiti:** Fase 2.
- **File:** `frontend/**`.
- **Dipendenze:** react, react-router, @tanstack/react-query, @tanstack/react-table, tailwindcss, recharts, vitest.
- **Test:** build senza errori; lint; test delle utilità di formattazione; navigazione da PC e con finestra stretta.
- **Completamento:** l'Overview mostra lo stato di `/api/health` e i conti dal DB.

### Fase 4 — Dati mock e pipeline di ingestione
- **Obiettivo:** dati realistici in DB passando dalla stessa pipeline dei dati veri.
- **Output:** interfaccia dei connettori, connettore mock (CA, Revolut, carta di credito, Trading 212) con 12–18 mesi di movimenti verosimili (stipendio, abbonamenti, trasferimenti CA→Revolut, versamenti a T212, rimborsi), pipeline normalizza → deduplica → salva, `sync_logs`, form di inserimento manuale.
- **Prerequisiti:** Fase 3.
- **Test:** due sync consecutivi non creano duplicati; pending → booked senza doppioni; inserimento manuale validato.
- **Completamento:** la pagina Transactions mostra i dati mock con ricerca e filtri.

### Fase 5 — Motore di classificazione e sezione spese
- **Obiettivo:** classificazione automatica, regole che apprendono, trasferimenti interni, spese ed entrate.
- **Output:** normalizzazione merchant, pipeline di classificazione (§11), override manuali, regole learned con anteprima, abbinamento dei trasferimenti, rimborsi, pagine Expenses, Income, Transactions complete, Rules.
- **Prerequisiti:** Fase 4.
- **Test:** unit test di ogni regola e del caso "10 € trasferiti / 5 € spesi"; un override sopravvive a una nuova sync; % di movimenti mock classificati.
- **Completamento:** ≥ 90% dei movimenti mock classificati correttamente; grafici e confronti funzionanti.

### Fase 6 — Budget e ricorrenze
- **Obiettivo:** budget facoltativi con alert e ricorrenze con conferma.
- **Output:** CRUD budget, calcolo speso vs budget e proiezione, alert; algoritmo di rilevamento (stesso merchant, importo ±10%, intervalli regolari 7/14/30/90/365 giorni, almeno 3 occorrenze, 2 per gli annuali), suggerimenti da confermare, prossimi addebiti.
- **Prerequisiti:** Fase 5.
- **Test:** abbonamenti mock riconosciuti con la frequenza giusta; nessun falso positivo evidente; alert alle soglie giuste.
- **Completamento:** pagina Budgets e sezione ricorrenze funzionanti.

### Fase 7 — Integrazione Trading 212 (read-only)
- **Obiettivo:** portafoglio reale nella dashboard.
- **Output:** chiave demo e poi live read-only (§9); client solo-lettura con gestione dei limiti di frequenza; sync di cash, posizioni, ordini, dividendi, flussi; snapshot; calcoli del §13; pagina Investments.
- **Prerequisiti:** Fase 6; chiave creata da te.
- **Test:** test delle formule con casi numerici noti; test "nessun metodo di scrittura"; prova in demo che la creazione di un ordine viene rifiutata; confronto dei valori con l'app Trading 212.
- **Completamento:** valore, cash e P/L coincidono con l'app (entro arrotondamenti).

### Fase 8 — Integrazioni bancarie (Open Banking)
- **Obiettivo:** CA Italia e Revolut reali.
- **Output:** account Enable Banking; client firmato JWT; flusso di consenso con redirect locale; sync di conti, saldi e movimenti; gestione scadenza consensi; verifica della carta di credito CA (se non disponibile → inserimento manuale, CSV solo come ultima risorsa).
- **Prerequisiti:** Fase 7; app CA e Revolut per la SCA.
- **Test:** sandbox prima, poi conti veri; nessun duplicato con i dati manuali; saldi coerenti con le app; rispetto del limite di 4 sync al giorno.
- **Completamento:** movimenti veri classificati e trasferimenti CA↔Revolut riconosciuti.

### Fase 9 — Patrimonio netto e overview
- **Obiettivo:** vista unificata del patrimonio.
- **Output:** snapshot giornalieri, ricostruzione dello storico dai saldi, pagina Net Worth, Overview completa con avvisi.
- **Prerequisiti:** Fase 8.
- **Test:** somma dei componenti = totale; storico coerente con i saldi.
- **Completamento:** l'Overview risponde a "quanto ho, quanto spendo, quanto rendo".

#### Note di implementazione (Fase 9, 2026-10-06)

- **PayPal** (stesso flusso Enable Banking: Italia, non beta, 180 giorni). Il conto arriva senza valuta (`XXX`) e con il prodotto `PAYPAL_PREMIER_ACCOUNT`: si chiama «Conto PayPal», è in euro, e i **saldi per valuta** (un portafoglio per valuta, tipo `XPCD`) si sommano convertendo in euro, come il totale dell'app PayPal. I prelievi verso la banca (`PAYMENT / MONEY_TRANSFER`, senza destinatario) si chiamano «Trasferimento di denaro».
- **PayPal senza doppioni** (`classification/paypal.py`): un acquisto su PayPal e lo stesso importo sulla banca come `PAYPAL *NEGOZIO` entro 3 giorni = pagamento finanziato dalla carta: la spesa resta su PayPal (nome vero del negozio), la riga della banca diventa un trasferimento interno. Prelievo da PayPal ↔ entrata `PAYPAL*NOME COGNOME` sulla banca, con al massimo il 5% in meno (commissione) entro 3 giorni = giroconto abbinato; un prelievo senza l'altro lato resta comunque un giroconto.
- **Cambi BCE** (`integrations/ecb.py`, `ingestion/fx.py`): prima di salvare i movimenti si controllano i cambi delle valute presenti; se mancano si scarica lo storico pubblico della BCE (`eurofxref-hist.zip`, CSV, nessun dato dell'utente nella richiesta) e si salvano in `fx_rates` (`source = BCE`). Weekend e festivi usano l'ultimo cambio precedente. Nei test la rete è sempre spenta.
- **Costo del cambio** (`ingestion/reconcile.py`): PayPal converte le altre valute in euro con un cambio peggiore di quello BCE (qualche punto percentuale) e la conversione non arriva come movimento, quindi le entrate in valuta risultavano più alte delle uscite a parità di saldo. Dopo ogni sincronizzazione si confronta il saldo vero con quello atteso (saldo salvato precedente + movimenti nel mezzo, esclusi gli acquisti coperti da una carta): se nel mezzo ci sono movimenti in un'altra valuta e la differenza è al massimo il 6% di quei movimenti, diventa il movimento «Costo del cambio PayPal» (commissione, Altro; regola di sistema `fx_conversion_cost`), uno per giorno, aggiornato e mai duplicato.
- **Storico del saldo PayPal:** gli acquisti coperti da una carta non cambiano il saldo PayPal e non entrano nella sua ricostruzione.
- **Compensi settimanali variabili:** la regola automatica dello stipendio (stesso ordinante, ±15%, 3 mesi) non basta per importi che cambiano ogni settimana → si crea una regola utente sul pagatore (tipologia Stipendio); le entrate occasionali di altri pagatori restano «Bonifico ricevuto».

- **Patrimonio di oggi** (`backend/app/services/networth.py`, `GET /api/networth?since=`): conti attivi con «includi nel patrimonio»; banche = ultimo saldo **disponibile** (altrimenti contabile), come in Panoramica; broker = valore del conto (liquidità + titoli) salvato a ogni sincronizzazione. Liquidità = tutto ciò che non è broker.
- **Storico delle banche:** ricostruito all'indietro dall'ultimo saldo **contabile** togliendo i movimenti contabilizzati (in avanti per i giorni dopo il saldo). Prima del primo movimento noto il conto non ha dati: il giorno è **parziale** e il totale non lo comprende (alcune banche danno solo 90 giorni di storico).
- **Storico del broker:** valore giornaliero salvato da quando è collegato; prima è **stimato** con il capitale versato (versamenti − prelievi), senza le variazioni di mercato.
- **Foto giornaliera** (`net_worth_snapshots`): dopo ogni sincronizzazione riuscita si salva il patrimonio del giorno (per conto in `breakdown`); per i giorni con la foto valgono i valori salvati. Se la foto non riesce la sincronizzazione resta valida.
- **Variazioni** a 30, 90 e 365 giorni: il totale solo se il giorno di partenza non è parziale né stimato; altrimenti la sola liquidità (se completa). `complete_from` = primo giorno con dati veri per tutti i conti.
- **Verifiche:** somma delle parti = totale in ogni giorno; l'ultimo giorno coincide con il patrimonio di oggi; sui dati veri lo storico ricostruito coincide con ogni saldo contabile salvato (test e controllo senza importi).
- **Pagina /patrimonio:** tessere (patrimonio con variazione a 30 giorni, liquidità, investimenti, ultimo anno), grafico impilato liquidità + investimenti (tratteggio per la parte stimata, grigio per i giorni parziali, etichetta per mese, tabella dei dati a fine mese, asse degli importi sfocato in modalità privacy), note su da quando ogni conto ha dati veri, peso di ogni conto. Periodo: 3 mesi, 6 mesi (predefinito), 1 anno, tutto.
- **Panoramica:** le quattro tessere sono vere (patrimonio netto, spese ed entrate del mese con confronto e tasso di risparmio, rendimento degli investimenti sul capitale versato, non annualizzato), andamento del patrimonio negli ultimi 3 mesi e riquadro **Da sistemare** che raccoglie sincronizzazioni fallite, consensi scaduti o in scadenza (14 giorni), budget superati o vicini alla soglia, ricorrenze in ritardo o da confermare, spese del mese da classificare (prima i problemi, poi gli avvisi; icona e testo, mai solo colore).

### Fase 10 — Sicurezza, pulizia, preparazione al deploy
- **Obiettivo:** progetto solido e pronto per il VPS (senza deployarlo).
- **Output:** autenticazione (password + TOTP) attivabile; backup/restore cifrati provati; revisione della sicurezza; Dockerfile e compose; guida di deploy con Tailscale; eventuale cifratura di `D:\FinanceData`; pulizia del codice e documentazione.
- **Prerequisiti:** Fase 9.
- **Test:** restore completo su DB temporaneo; scansione dei segreti su tutta la history Git; login obbligatorio quando attivo; build dei container.
- **Completamento:** checklist di sicurezza tutta spuntata.


#### Note di implementazione (Fase 10, 2026-10-06)

- **Server di casa invece del VPS:** vecchio PC con Linux, Docker Compose (`deploy/`), raggiungibile solo via Tailscale (`tailscale serve`, HTTPS `*.ts.net`). Guida passo passo: [DEPLOY.md](DEPLOY.md); checklist: [SECURITY.md](SECURITY.md).
- **Accesso** (`app/auth/`, migrazione `a1f3c5e7b9d2`): un solo utente; password Argon2id (≥ 12 caratteri) + TOTP (segreto cifrato con `app.key`, un codice vale una volta). Cookie `fd_session` `HttpOnly`/`Secure`/`SameSite=Strict`, nel DB solo l'hash del token; scadenza 30 giorni, 7 senza uso. Blocco dopo 5 errori in 15 minuti. Configurazione solo da terminale (`python -m app.auth.cli setup`, QR nel terminale). Attivo con `AUTH_ENABLED=true` (sul server); spento in locale. Tutte le API tranne `/api/health` e `/api/auth/*` lo richiedono; richieste che modificano dati da un'origine estranea → 403; `/docs` spento. Frontend: pagina `/accesso`, ritorno alla pagina di prima, pannello «Accesso» in Impostazioni (sessioni, esci, esci da tutti i dispositivi).
- **Backup** (`app/backup/`): `pg_dump` → AES-256-GCM con `backup.key` (separata da `app.key`) → `${DATA_DIR}/backups/finance-*.fdbk`; automatico ogni `BACKUP_HOURS` (24), ultimi `BACKUP_KEEP` (30). Prova di ripristino completa in un database di prova (`BACKUP_VERIFY_DB`, nome `*_test`/`*_restore`), confronto delle righe tabella per tabella, poi svuotato. Primo backup vero: 27 tabelle, righe identiche.
- **Produzione:** il backend serve il frontend compilato (`STATIC_DIR`) con CSP stretta (hash dello script inline del tema, nessuna violazione su tutte le pagine) e intestazioni di sicurezza; mappe del codice non pubblicate. Immagine con utente non root e `pg_dump` 18; database con utente dell'app senza privilegi di amministratore.
- **Revisione:** gitleaks su tutta la storia, `pip-audit` e `pnpm audit --prod` senza vulnerabilità note; log delle richieste HTTP verso i provider disattivati (contenevano identificativi dei conti).
- **Da fare sul server:** build dei container e prova completa (sul PC Windows Docker non è installato per lo spazio su C:).
---

## 17. Prima fase da iniziare subito

Vedi **Fase 0** nel §16; il dettaglio operativo viene presentato in chat e richiede approvazione prima di essere eseguito.

---

## 18. Lingue dell'interfaccia (i18n)

> Approvata il 2026-11-03. Decisione: [ADR 0006](decisions/0006-i18n.md).

**Obiettivo.** Interfaccia in inglese e italiano. Chi apre la demo la usa tutta in inglese; l'installazione con i dati veri, in italiano, resta identica a prima nell'aspetto e nei dati.

**Inventario di partenza (2026-11-03).** Conteggi approssimati (estratti dal sorgente con uno script, ±5%).

| Origine | Testi | Note |
|---|---|---|
| Frontend: navigazione, layout, componenti comuni | 107 | di cui ~45 nella pagina "in arrivo" non più raggiungibile |
| Frontend: pagine | 324 | Panoramica 44, Investimenti 69, Ricorrenze 35, Spese 32, Budget 29, … |
| Frontend: componenti di dominio | 529 | editor, filtri, card, form (Regole 54, Categorie 51, dettaglio movimento 32, …) |
| Frontend: grafici | 49 | assi, legende, tooltip, tabelle dei dati |
| Frontend: tabelle ed elenchi | 49 | movimenti, posizioni, attività, merchant |
| Frontend: etichette, enum, periodi, date relative | 70 | tipi di movimento, frequenze, periodi, "Oggi/Ieri" |
| Frontend: messaggi di esito ed errore | 21 | non ci sono toast: esiti di sincronizzazione e salvataggio |
| Frontend: /privacy e /termini | 42 | |
| **Totale frontend** | **~1.190** (950 diversi) | 118 con parametri, 18 plurali a mano |
| Backend: errori delle API | 36 | `HTTPException` |
| Backend: errori interni che arrivano all'utente | ~75 | validazione, servizi, connettori (finiscono nei log di sync o negli errori) |
| Backend: "perché" della classificazione | ~25 | `classification_note` (regola, merchant, MCC, trasferimento, viaggio, rimborso, …) |
| Backend: nomi generati e voci sintetiche | 5 | "Trasferimento di denaro", "Costo del cambio …", "Differenza di cambio a favore", "Da classificare", "Senza sottocategoria" |
| Backend: riquadro "Da sistemare" | 0 | gli 8 avvisi sono composti dal frontend (già contati sopra) |
| Seed | 18 categorie, 16 sottocategorie, 9 tipologie di entrata, 26 regole di sistema, 74 merchant | i merchant sono nomi propri (non si traducono); le regole hanno nomi e parole chiave in italiano |
| Dati demo | ~60 testi | descrizioni dei movimenti (causali bancarie italiane), controparti, nomi dei conti e delle sorgenti "(prova)" |
| Fuori perimetro | 48 CLI, ~25 log, 80 descrizioni OpenAPI | non sono interfaccia; restano in italiano |

**Glossario obbligatorio** (si cambia solo con l'approvazione del proprietario):

| Italiano | English |
|---|---|
| Panoramica | Overview |
| Movimenti | Transactions |
| Spese | Expenses |
| Entrate | Income |
| Patrimonio netto | Net worth |
| Investimenti | Investments |
| Ricorrenze | Recurring payments |
| Budget | Budgets |
| Da sistemare | Needs attention |
| Trasferimento interno / giroconto | Internal transfer |
| Spese divise | Split expenses |
| In sospeso | Pending |
| Contabilizzato | Booked |
| Saldo disponibile / contabile | Available / Booked balance |
| Consenso (bancario) | Bank consent |
| Rendimento sul capitale versato | Return on net deposits |
| Modalità privacy | Privacy mode |
| Uscite (categoria: discoteche, cinema, sale giochi) | Going out |

Un test controlla che le voci del glossario presenti nei file di traduzione usino proprio questi termini.

**Vincoli trasversali.** Gli URL non cambiano (`/impostazioni/ritorno-banca` ed `EB_REDIRECT_URL` sono registrati in Enable Banking). I dati dell'utente non si traducono mai. Durante lo sviluppo nessuna sincronizzazione con le banche vere: si usa solo la demo. Nessun segreto nel repository; commit piccoli, uno o più per fase; nessun push senza approvazione. Alla fine di ogni fase: test verdi, nota qui sotto, stop e approvazione.

### Fase I1 — Infrastruttura e selettore di lingua
- **Output:** i18next + react-i18next; `src/i18n/` con configurazione, tipi (`CustomTypeOptions`) e `locales/it.ts`, `locales/en.ts`; lingua da `fd-language` → lingua del browser → inglese; `lib/format.ts` con locale dinamica (`en-GB` / `it-IT`), formatter in cache per locale; `<html lang>` e titolo della scheda aggiornati; selettore "Lingua" nelle Impostazioni (pannello Aspetto). Pagina di prova: **Impostazioni**.
- **Controlli:** test di parità delle chiavi (stesse chiavi, nessun valore vuoto, stessi segnaposto); regola `no-literal-string` attiva solo sui file già tradotti, con le eccezioni elencate; test della pagina Impostazioni in entrambe le lingue; test di `format.ts` in entrambe le locale; test della scelta della lingua (salvata, browser, ripiego).
- **Completamento:** in italiano nulla cambia (stessi test di oggi verdi, screenshot uguali); la pagina Impostazioni è tutta in inglese con `en`.

#### Note di implementazione (Fase I1, 2026-11-03)
- **Librerie:** i18next 26, react-i18next 17, eslint-plugin-i18next 6 (funziona con ESLint 10). Un solo namespace (`translation`) con chiavi annidate per area: `common`, `nav`, `settings`, `connections`, `banks`, `categories`, `merchants`, ….
- **Tipi:** `src/i18n/locales/it.ts` è il riferimento (`as const`); `en.ts` lo rispetta con `satisfies Messages`. In `i18next.d.ts` sono attivi `strictKeyChecks` e `strictInterpolationChecks`: chiave sbagliata o parametro dimenticato non compilano.
- **Lingua:** preferenza `fd-language` (`auto` | `en` | `it`) in `lib/preferences.ts`; nuova scheda **Lingua** in Impostazioni (Automatica, English, Italiano; nomi delle lingue sempre nella lingua stessa) con l'indicazione della lingua del browser. Al cambio di lingua l'app si rimonta (`LanguageBoundary` in `providers.tsx`), così anche gli importi formattati fuori da `t()` cambiano; la cache delle query resta.
- **Formati:** `lib/format.ts` usa la locale della lingua (`en-GB` / `it-IT`), anche per "Oggi/Ieri/Domani/adesso"; nuovo `formatQuantity` al posto dei due formattatori `it-IT` delle quantità di titoli. `parseAmountInput` capisce sia "1.234,56" sia "1,234.56"; le migliaia senza decimali seguono la lingua ("1.234" in italiano, "1,234" in inglese). I nomi dei paesi nel collegamento di una banca vengono da `Intl.DisplayNames`.
- **Tradotti:** pagina Impostazioni con tutte le sue schede (Aspetto, Lingua, Privacy, Accesso, Connessioni con banche e Trading 212, Categorie, Merchant, Tipologie di entrata), più la shell (barra laterale, barra in alto, menu su telefono, periodo, stato del backend, titolo della scheda) e i messaggi d'errore generici del client. Le voci del menu hanno un `id` e prendono etichetta, etichetta breve e descrizione da `nav.items.<id>`.
- **Anticipato dalla fase I2:** tolte la pagina "in arrivo" (`PlannedPage`) e gli elenchi `planned`, irraggiungibili; il riquadro "Avanzamento" resta fino alla fase I2.
- **Plurali:** dove prima il numero 1 dava frasi sbagliate ("1 ricorrenze da confermare", "scade tra 1 giorni", "1 movimenti nuovi") ora c'è il singolare; per tutti gli altri numeri l'italiano è identico.
- **Lint:** `i18next/no-literal-string` in modalità `all` sui soli file tradotti (`I18N_FILES` in `eslint.config.js`); eccezioni motivate nella configurazione (classi CSS, `new Error` per chi sviluppa, percorsi dell'API, attributi tecnici, identificatori senza spazi, simboli tipografici, la direttiva `"use client"`).
- **Test:** 131 (erano 104). Nuovi: parità delle chiavi, traduzioni non vuote, stessi segnaposto e tag, glossario; scelta della lingua; formati in `en-GB`; pagina Impostazioni in entrambe le lingue e cambio di lingua dal selettore. I test esistenti girano in italiano (`tests/setup.ts` sceglie `it`, perché jsdom ha un browser inglese).
- **Prova a vista:** solo frontend (`pnpm dev --port 5180`, senza backend), cambio di lingua dalle Impostazioni verificato nel browser. Il backend non è stato avviato: `config/.env.example` punta al database `finance` su `127.0.0.1:5432`, lo stesso nome del database vero in locale. Per la verifica della demo (fasi I2–I4) serve un database separato, per esempio `finance_demo`.

### Fase I2 — Tutto il frontend
- **Output:** una pagina alla volta (Panoramica e "Da sistemare", Movimenti, Spese, Entrate, Patrimonio netto, Investimenti, Budget, Ricorrenze, Regole, Accesso, Ritorno dalla banca, /privacy, /termini, 404), con i componenti che usano; plurali con i18next; grafici (assi, tooltip, tabelle dei dati) con la locale. A fine fase `no-literal-string` vale per tutto `src/`.
- **Si tolgono invece di tradurli:** la pagina "in arrivo" e gli elenchi `planned` della navigazione, ormai irraggiungibili (tutte le pagine sono pronte), e il riquadro "Avanzamento" della Panoramica con l'elenco delle fasi (`ROADMAP`, `CURRENT_PHASE`).
- **Controlli:** i test esistenti restano verdi in italiano; i test delle pagine principali (Panoramica, Movimenti, Spese, Entrate, Investimenti, Patrimonio, Budget, Ricorrenze, Regole, Impostazioni) girano in entrambe le lingue.
- **Completamento:** con `en` nessun testo fisso italiano nel frontend; restano in italiano solo i messaggi che arrivano dal backend (fase I3) e i dati.

#### Note di implementazione (Fase I2, 2026-11-03)
- **File di traduzione per area:** `locales/it/*.ts` ed `en/*.ts` (`overview`, `transactions`, `analytics`, `networth`, `investments`, `budgets`, `recurring`, `rules`, `pages`), uniti in `it.ts` ed `en.ts`. Ogni parte inglese rispetta la sua parte italiana con `satisfies Widen<typeof it>`.
- **Etichette come funzioni:** le mappe fisse (tipi di movimento, fonti della classificazione, stati, frequenze, intervalli del patrimonio, serie dei grafici) sono diventate funzioni o getter che leggono la lingua attuale (`kindLabel`, `frequencyLabel`, …).
- **Tolto** il riquadro "Avanzamento" della Panoramica (`ROADMAP`, `CURRENT_PHASE`). Due testi che citavano le fasi del progetto (conti assenti in Panoramica, movimenti assenti) ora rimandano alle Impostazioni.
- **Importi negli editor** (budget, ricorrenze, regole): precompilati nel formato della lingua ("12,50" / "12.50"). Data di aggiornamento di privacy e termini formattata con la locale.
- **Lint su tutto `src/`**, esclusi i file di traduzione, i test e lo schema dell'API. Eccezioni ristrette rispetto alla fase I1: gli identificatori esclusi sono solo quelli minuscoli o in camelCase (le parole con la maiuscola vengono segnalate) e `new Error(...)` non è più un'eccezione, perché questi messaggi arrivano all'interfaccia. Restano escluse, con il motivo nel codice: variabili CSS e proprietà di stile dei grafici, media query, locale tecniche di `Intl`, nomi di browser e sistemi operativi, due errori di programmazione.
- **Test:** 151 (erano 131). Nuovo `tests/pages-i18n.test.tsx`: le 10 pagine principali in italiano e in inglese, con il titolo preso dalle traduzioni; in inglese il testo della pagina (tolti i dati del backend simulato) non contiene parole italiane frequenti, in italiano sì (il controllo non è a vuoto).
- **Screenshot:** `scripts/screenshot.mjs --lang en|it` imposta la lingua prima che l'app parta. Lo screenshot "inglese" della fase I1 era stato fatto cambiando la lingua dopo l'avvio ed era rimasto in italiano.
- **Prova a vista** (solo frontend, senza backend): 13 pagine in inglese, nessuna parola italiana; con il backend spento si vedono stati vuoti e d'errore, non tabelle e grafici con dati (coperti dai test).
- **Ancora in italiano con `en`**, come previsto: messaggi d'errore del backend, il "perché" della classificazione, nomi delle regole imparate, "Da classificare" e "Senza sottocategoria" nelle analisi (fase I3); categorie, merchant e regole del database (dati).

### Fase I3 — Backend: codici al posto delle frasi
- **Output:**
  - errori API `{"detail": {"code", "params"}}` ed errori di validazione con `PydanticCustomError` (codice in `type`, parametri in `ctx`); il frontend traduce, e mostra il testo grezzo per i codici sconosciuti;
  - migrazione: `transactions.classification_reason` (testo) + `classification_params` (JSONB); `sync_logs.error_code` + `error_params`; le colonne di testo esistenti restano per lo storico; dopo la prima riclassificazione `classification_note` non serve più e si toglie in una migrazione successiva;
  - `description_code` nelle risposte dei movimenti, ricavato dai dati esistenti (`fx-adjust-*`, `MONEY_TRANSFER`): le descrizioni salvate non cambiano, quindi impronte anti-doppioni e regola `fx_conversion_cost` restano valide;
  - analisi: codice al posto di "Da classificare" e "Senza sottocategoria".
- **Controlli:** test del backend aggiornati ai codici; un test verifica che ogni codice emesso dal backend abbia una traduzione in entrambe le lingue (elenco dei codici esportato nello schema OpenAPI); migrazione avanti e indietro su database di prova; con dati salvati prima della migrazione il dettaglio del movimento e i log di sync mostrano ancora il testo di prima.
- **Completamento:** con `en` il "perché", gli errori e i log di sync sono in inglese per tutti i dati nuovi; nessuna riga esistente viene riscritta dalla migrazione.

### Fase I4 — Seed e demo in inglese
- **Output:** `database/seeds/en/` (categorie, sottocategorie, tipologie di entrata, regole di sistema con nomi inglesi; stessi `code`); le regole inglesi riconoscono sia le causali italiane sia quelle inglesi; `SEED_LOCALE` (`en` predefinito | `it`) letto solo su database vuoto e salvato nel database (un database già popolato senza lingua salvata vale `it` per sempre); scenario di prova in inglese (nomi dei conti, sorgenti "(demo)", descrizioni e controparti inventate in inglese, negozi di catene internazionali, stessi importi e date dello scenario italiano; banche e broker invariati).
- **Controlli:** test del seed in entrambe le lingue (idempotente, stessi codici); test che un database già popolato non cambia con `SEED_LOCALE=en`; test di accuratezza della classificazione anche sullo scenario inglese (soglia 90%); controllo automatico "nessuna parola italiana" su tutte le pagine della demo in inglese, riquadro "Da sistemare" compreso (testo estratto dalle pagine con `scripts/screenshot.mjs`, confronto con un elenco di parole italiane, eccezioni per i nomi propri), con gli screenshot di ogni pagina.
- **Completamento:** demo in inglese senza parole italiane; demo in italiano e installazione vera invariate.

### Fase I5 — README
- **Output:** screenshot rifatti con la demo in inglese; una riga sulla scelta della lingua (Impostazioni, lingua del browser, `SEED_LOCALE`).
- **Completamento:** README coerente con l'app.

### Decisioni sulle domande aperte (2026-11-03)
- `SEED_LOCALE` predefinito **`en`**, per l'uso internazionale. L'installazione esistente non cambia: il suo database è già popolato, quindi vale `it`.
- Il riquadro "Avanzamento" della Panoramica si toglie (fase I2).
- Demo in inglese: negozi di catene internazionali al posto di quelli italiani (Esselunga, Conad, la Feltrinelli, …); restano Crédit Agricole Italia, Revolut e Trading 212, e la città è "Milan".

---

## Fonti
- Enable Banking – Accounts API: https://enablebanking.com/accounts-api/
- Free & Indie Open Banking APIs 2026: https://www.openbankingtracker.com/guides/free-open-banking-apis
- Crédit Agricole Italia – Open Banking Tracker: https://www.openbankingtracker.com/provider/credit-agricole-italia
- Enable Banking changelog aprile 2026: https://enablebanking.com/blog/2026/05/14/enable-banking-changelog-april-2026
- GoCardless Bank Account Data – annuncio: https://gocardless.com/bank-account-data/announcement
- Trading 212 Public API (v0): https://t212public-api-docs.redoc.ly
