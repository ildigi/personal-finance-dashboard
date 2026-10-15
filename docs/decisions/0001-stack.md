# 0001 — Stack: FastAPI + PostgreSQL + React

- **Data:** 2026-10-04
- **Stato:** Accettata

## Contesto
Dashboard personale, un solo utente, sviluppo su Windows, futura migrazione su VPS Linux. La logica dati (classificazione, ricorrenze, calcoli di portafoglio) è il cuore del progetto; le tabelle filtrabili sono il cuore della UI.

## Decisione
- Backend: Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, httpx, APScheduler; tooling uv, ruff, mypy, pytest.
- Database: PostgreSQL.
- Frontend: React, TypeScript strict, Vite, TanStack Query/Table, Tailwind + shadcn/ui, Recharts; tooling pnpm, ESLint, Prettier, Vitest.

## Conseguenze
- Due linguaggi da mantenere, compensati dalla tipizzazione end-to-end (client TS generato da OpenAPI).
- Niente Celery/Redis: lo scheduler gira nel processo del backend.
- Stesso codice in locale e su VPS.
