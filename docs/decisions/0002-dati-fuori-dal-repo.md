# 0002 — Dati e segreti fuori dal repository

- **Data:** 2026-10-04
- **Stato:** Accettata

## Contesto
Il codice sta su GitHub. I dati finanziari e le credenziali non devono mai lasciare il PC tramite Git.

## Decisione
- Dati, backup, export, log e segreti in `D:\FinanceData` (`DATA_DIR`), mai dentro il repository.
- `D:\FinanceData\secrets` accessibile solo all'utente Windows proprietario.
- `.gitignore` esclude segreti e formati di dati; gitleaks (pre-commit) blocca i commit sospetti.
- Il repository contiene solo codice, documentazione e dati di prova inventati: per questo può essere pubblico.

## Conseguenze
- Un clone del repository da solo non contiene nulla di sensibile.
- Serve un backup separato di `D:\FinanceData` (Fase 10).
