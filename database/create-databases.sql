-- PostgreSQL installato a mano (senza Docker): utente dell'app e database.
-- Da eseguire una volta come superutente, scegliendo la password dell'app:
--
--   psql -U postgres -v app_pw='scegli-una-password' -f database/create-databases.sql
--
-- Poi la stessa password in DATABASE_URL e TEST_DATABASE_URL di backend/.env
-- (vedi config/.env.example).
\set ON_ERROR_STOP on

CREATE ROLE finance_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE finance OWNER finance_app;
CREATE DATABASE finance_test OWNER finance_app;
REVOKE ALL ON DATABASE finance FROM PUBLIC;
REVOKE ALL ON DATABASE finance_test FROM PUBLIC;
