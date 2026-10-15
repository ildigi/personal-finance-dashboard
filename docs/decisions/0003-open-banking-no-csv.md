# 0003 — Banche via Open Banking, niente CSV

- **Data:** 2026-10-04
- **Stato:** Accettata

## Contesto
L'utente non vuole import CSV. Crédit Agricole Italia e Revolut (conti personali) non offrono API dirette a privati: le API PSD2 sono riservate a TPP autorizzati.

## Decisione
- Crédit Agricole Italia e Revolut tramite **Enable Banking** (accesso "Restricted Production" gratuito per i propri conti), solo servizio AIS.
- Sviluppo iniziale con un connettore **mock** che genera dati nel DB (nessun file).
- Eccezione unica: la carta di credito CA, se non esposta via PSD2 → prima inserimento manuale dalla UI, CSV solo come ultima risorsa.

## Conseguenze
- Consenso PSD2 da rinnovare ogni 180 giorni (avviso in UI).
- Massimo 4 sync automatici al giorno per conto.
- Dipendenza da un provider terzo; GoCardless Bank Account Data non è un'alternativa (registrazioni chiuse da luglio 2025).
