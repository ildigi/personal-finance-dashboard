#!/bin/sh
# Primo avvio del PostgreSQL di compose.yaml (demo e sviluppo): utente dell'app senza
# privilegi di amministratore, database dell'app e database dei test automatici.
set -eu

psql -v ON_ERROR_STOP=1 --username postgres <<SQL
CREATE ROLE finance_app LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE finance OWNER finance_app;
CREATE DATABASE finance_test OWNER finance_app;
REVOKE ALL ON DATABASE finance FROM PUBLIC;
REVOKE ALL ON DATABASE finance_test FROM PUBLIC;
SQL
