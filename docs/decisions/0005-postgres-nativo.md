# 0005 — PostgreSQL nativo, niente Docker in locale

- **Data:** 2026-10-04
- **Stato:** Accettata

## Contesto
Sul disco C: ci sono circa 12 GB liberi; Docker Desktop + WSL2 ne occuperebbe una parte rilevante.

## Decisione
- PostgreSQL 18 installato nativamente: binari in `D:\Programs\PostgreSQL\18`, dati in `D:\FinanceData\pgdata`.
- `listen_addresses = 'localhost'`, `pg_hba.conf` solo loopback con `scram-sha-256`.
- Utente applicativo `finance_app` senza privilegi di amministrazione; DB `finance` e `finance_test`.
- Docker verrà usato solo per il deploy su VPS (Fase 10).

## Conseguenze
- Aggiornamenti di PostgreSQL manuali (l'installer EDB va scaricato dal browser: i download automatici ricevono 403).
- Lo schema resta portabile grazie alle migrazioni Alembic.
