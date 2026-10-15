# backend

API FastAPI (Python 3.12, gestita con `uv`). Struttura in [SPEC §7](../docs/SPEC.md).

```
app/
├─ main.py         app FastAPI: CORS, TrustedHost, router, gestione errori
├─ core/           configurazione (pydantic-settings), logging con mascheramento IBAN
├─ db/             base dichiarativa e convenzioni, sessione, seed
├─ models/         modelli SQLAlchemy di tutte le tabelle (SPEC §10)
├─ schemas/        schemi Pydantic di input/output
├─ api/            router REST sotto /api
├─ services/       logica (movimenti manuali, correzioni con override, cambi, date)
├─ integrations/   connettori di SOLA LETTURA: interfacce comuni, mock, registro
└─ ingestion/      pipeline normalizza → deduplica → salva, sync_logs, comandi
alembic/           migrazioni
tests/             pytest su finance_test
```

## Configurazione
`backend/.env` (non versionato) copiato da `config/.env.example`. Database: `DATABASE_URL` e
`TEST_DATABASE_URL` (già pronte per `docker compose up -d db`), oppure le credenziali in
`${DATA_DIR}/secrets/db.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_NAME_TEST`,
esempio in `config/db.env.example`). Con `DEMO_MODE=true` (default) l'avvio applica da solo migrazioni,
seed e dati di prova.

## Comandi (da `backend/`)

| Comando | Cosa fa |
|---|---|
| `uv sync` | crea/aggiorna `.venv` dal lockfile |
| `uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` | avvia l'API (task VS Code `dev:backend`) |
| `uv run alembic upgrade head` | applica le migrazioni a `finance` |
| `uv run alembic -x db=test upgrade head` | idem su `finance_test` |
| `uv run alembic revision --autogenerate -m "..."` | nuova migrazione (da rileggere sempre) |
| `uv run python -m app.db.seed` | categorie, sottocategorie, tipologie di entrata (idempotente) |
| `uv run python -m app.ingestion.cli mock-setup` | crea le sorgenti di prova e le sincronizza (task `db:seed-mock`) |
| `uv run python -m app.ingestion.cli sync --all` | sincronizza tutte le sorgenti (task `sync:all`) |
| `uv run python -m app.ingestion.cli mock-remove --yes` | elimina **solo** i dati di prova (prima di collegare i conti veri) |
| `uv run pytest` | test (ricrea lo schema di `finance_test`, mai `finance`) |
| `uv run ruff check . ; uv run ruff format --check . ; uv run mypy app tests` | lint, format, tipi |

Documentazione interattiva: <http://127.0.0.1:8000/docs> · schema OpenAPI: `/api/openapi.json`.

## Endpoint (Fase 2)

| Metodo e percorso | Note |
|---|---|
| `GET /api/health` | stato del backend, connessione DB, migrazioni allineate (503 se il DB non risponde) |
| `GET/POST /api/sources`, `GET/PATCH /api/sources/{id}` | connessioni ai provider; l'output non espone mai riferimenti a segreti |
| `GET/POST /api/accounts`, `GET/PATCH/DELETE /api/accounts/{id}` | `DELETE` solo se il conto non ha movimenti (altrimenti `is_active=false`) |
| `GET/POST /api/categories`, `GET/PATCH/DELETE /api/categories/{id}` | archiviazione con `is_archived`; categorie di sistema protette |
| `POST /api/categories/{id}/subcategories`, `PATCH/DELETE /api/subcategories/{id}` | |
| `GET /api/income-types` | tipologie di entrata |
| `GET /api/transactions` | filtri (periodo, conto, tipo, categoria, stato, testo, importo, da classificare), ordinamento, paginazione, totali del filtro |
| `GET /api/transactions/{id}` | dettaglio con dato grezzo e correzioni manuali |
| `POST /api/transactions` | inserimento manuale |
| `PATCH /api/transactions/{id}` | correzione: sui movimenti sincronizzati crea `manual_overrides`; date/importi modificabili solo sui manuali |
| `DELETE /api/transactions/{id}` | solo movimenti manuali |

| `POST /api/sources/{id}/sync` | sincronizza subito una sorgente; restituisce l'esito di ogni passo |
| `GET /api/sync-logs` | storico delle sincronizzazioni (filtro `source_id`) |
| `POST /api/mock/setup` | carica i dati di prova (non disponibile con `APP_ENV=production`) |

`GET /api/accounts` include l'ultimo saldo contabile di ogni conto (`balance`, `balance_as_of`).

## Ingestione (Fase 4)
Tutti i connettori implementano le stesse interfacce di sola lettura (`app/integrations/base.py`):
i dati di prova e quelli veri seguono lo stesso percorso.

- **Idempotente:** un movimento è riconosciuto dall'ID del provider o, in mancanza, dall'impronta `dedupe_hash`.
- **Pending → booked:** un movimento contabilizzato con ID nuovo "promuove" il pending corrispondente
  (stesso conto e importo, date entro 5 giorni) invece di duplicarlo.
- **Pending spariti** (annullati dalla banca) vengono rimossi, salvo correzioni manuali.
- **Correzioni intoccabili:** la sync aggiorna solo i dati del provider; tipo, categoria, note non vengono mai sovrascritti.
- **Finestra:** alla prima sync 540 giorni; poi dall'ultimo movimento noto meno 10 giorni.
- **Log:** un `sync_log` per passo; in caso di errore la sync viene annullata ma il log resta, senza dati sensibili.
- **Dati di prova:** scenario deterministico dal 1° luglio 2025 (stipendio, affitto, abbonamenti, ricariche
  CA → Revolut, versamenti a Trading 212, spesa, rimborsi, saldo della carta di credito, ordini e dividendi).

Importi: in uscita sempre stringhe (`"-12.50"`); in ingresso stringhe o interi, i float JSON sono rifiutati.
