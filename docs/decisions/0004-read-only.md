# 0004 — Integrazioni esclusivamente read-only

- **Data:** 2026-10-04
- **Stato:** Accettata

## Decisione
Tre livelli di protezione:
1. **Permessi del provider:** Trading 212 senza permessi di esecuzione ordini o scrittura Pie; Enable Banking solo AIS, mai PIS.
2. **Codice:** i client espongono solo metodi di lettura; un test fallisce se compare una chiamata non-`GET` verso il broker.
3. **UI:** nessuna funzione dispositiva.

## Conseguenze
La dashboard non può muovere denaro né operare sul portafoglio, anche in caso di bug o compromissione delle chiavi.
