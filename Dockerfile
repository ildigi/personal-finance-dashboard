# syntax=docker/dockerfile:1
# Immagine unica: backend FastAPI + frontend compilato (servito dal backend).
# Costruzione: docker compose -f deploy/compose.yaml build   (vedi docs/DEPLOY.md)

# --- 1. Frontend -----------------------------------------------------------------------
FROM node:24-bookworm-slim AS web
WORKDIR /src/frontend
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
# Il client dell'API è già generato nel repository (src/api): niente backend qui.
RUN pnpm build && find dist -name "*.map" -delete

# --- 2. Backend ------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# pg_dump / pg_restore 18 (stessa versione del database) dal repository ufficiale PGDG.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
COPY database/ /app/database/
COPY --from=web /src/frontend/dist /app/static

# Utente senza privilegi; /data (segreti, backup, log) arriva da un volume.
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin finance \
 && mkdir -p /data && chown finance:finance /data
USER finance

ENV PATH="/app/backend/.venv/bin:$PATH" \
    APP_ENV=production \
    DATA_DIR=/data \
    STATIC_DIR=/app/static
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"

# Migrazioni a ogni avvio (idempotenti), poi il server. Con DEMO_MODE=true (default) il
# backend applica da solo seed e dati di prova; con i dati veri il seed si lancia a mano
# una volta sola (rilanciarlo ricreerebbe le voci di sistema che hai eliminato).
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=*"]
