# frontend

React 19 + TypeScript (strict) + Vite, gestito con `pnpm`. Parla solo con il backend su `/api`
(proxy di Vite verso `127.0.0.1:8000`) e non contiene mai chiavi o segreti.

```
src/
├─ app/            router (pagine caricate su richiesta), provider, navigazione e roadmap
├─ api/            client tipizzato: schema.d.ts e openapi.json GENERATI dal backend
├─ components/
│  ├─ ui/          componenti shadcn/ui (Radix + Tailwind)
│  ├─ layout/      shell: sidebar (PC), barra in basso + pannello "Altro" (telefono), barra superiore
│  └─ common/      importi, tessere KPI, stati, stati vuoti, interruttore, icone categorie
├─ features/       query TanStack per dominio
├─ lib/            formattazione it-IT, periodi, preferenze (tema, privacy, periodo)
└─ pages/          Panoramica, Movimenti, Impostazioni, pagine in arrivo, 404
tests/             test dell'app intera (Testing Library) + setup
```

## Comandi (da `frontend/`)

| Comando                                              | Cosa fa                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm install`                                       | installa le dipendenze dal lockfile                                                        |
| `pnpm dev`                                           | avvia su <http://127.0.0.1:5173> (serve anche il backend acceso: task `dev:full`)          |
| `pnpm build`                                         | typecheck + build di produzione in `dist/`                                                 |
| `pnpm test`                                          | test (Vitest + Testing Library, fuso Europe/Rome)                                          |
| `pnpm typecheck` · `pnpm lint` · `pnpm format:check` | tipi, ESLint (strict type-checked), Prettier                                               |
| `pnpm api:generate`                                  | rigenera il client tipizzato dallo schema OpenAPI del backend (non serve il server acceso) |

Dopo ogni modifica alle API del backend: `pnpm api:generate`. Se i tipi non tornano, il frontend non compila.

## Convenzioni

- **Importi:** arrivano come stringhe e si formattano con `formatMoney` / `<Money>` senza passare dai float;
  formato `1.234,56 €` (raggruppamento forzato anche a 4 cifre).
- **Date contabili** `YYYY-MM-DD` formattate senza slittamenti di fuso; timestamp mostrati in ora di Roma.
- **Dati sensibili** (importi, IBAN) marcati con `data-sensitive`: la modalità privacy li sfoca (tasto `P`).
  Gli IBAN si mostrano sempre mascherati (`IT00 •••• •••• 0000`).
- **Stati** sempre con icona + etichetta, mai solo colore.
- **Colori dei grafici:** token `--chart-1…8` (palette categoriale validata per daltonismo, chiaro e scuro) e
  `--status-*` riservati agli stati. In chiaro tre colori sono sotto 3:1 di contrasto: i grafici useranno
  etichette dirette o una vista a tabella.
- **Font** Inter variabile incluso nel bundle (nessuna richiesta a servizi esterni).
- **Preferenze** (tema, privacy, periodo) in `localStorage`: solo comodità locali, nessun dato finanziario.
- Responsive: sidebar da 1024 px in su, barra in basso sotto; aree di tocco ≥ 44 px.
