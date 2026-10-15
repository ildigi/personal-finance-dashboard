#!/bin/sh
# Primo avvio del database: utente dell'app senza privilegi di amministratore, database
# dell'app e database di prova dei backup (si svuota dopo ogni prova di ripristino).
set -eu

psql -v ON_ERROR_STOP=1 --username postgres <<SQL
CREATE ROLE finance_app LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE finance OWNER finance_app;
CREATE DATABASE finance_restore OWNER finance_app;
REVOKE ALL ON DATABASE finance FROM PUBLIC;
REVOKE ALL ON DATABASE finance_restore FROM PUBLIC;
SQL
