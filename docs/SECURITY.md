# Sicurezza — checklist (Fase 10, 2026-10-06)

Revisione fatta alla fine della Fase 10. ✅ = verificato (test automatici o prova a mano),
⚠️ = dipende da come si installa il server (vedi DEPLOY.md).

## Dati e segreti

- ✅ Nessun dato finanziario nel repository: dati, backup e segreti stanno in `DATA_DIR`
  (`D:\FinanceData` sul PC, `deploy/data` sul server), esclusi da Git e da Docker.
- ✅ Scansione dei segreti su **tutta la storia Git** (gitleaks, 12 commit): nessun segreto.
  Lo stesso controllo gira a ogni commit (pre-commit).
- ✅ Nomi, comuni e altri dati personali solo in `backend/.env` / `deploy/.env` o nelle
  regole tue nel database; nei test valori di fantasia.
- ✅ Consensi bancari e segreto TOTP cifrati nel DB con `app.key` (Fernet); backup cifrati
  con una chiave separata `backup.key` (AES-256-GCM).
- ✅ Cartella `secrets` leggibile solo dal tuo utente (Windows); sul server `chmod 700/600`
  e utente dedicato del container (uid 10001). ⚠️
- ✅ Log: IBAN mascherati; le richieste HTTP verso banche e broker non vengono più scritte
  (gli indirizzi contengono identificativi dei conti).
- ⚠️ Cifratura del disco: sul server LUKS all'installazione. Sul PC Windows 11 Home
  conviene attivare la «Crittografia del dispositivo» (Impostazioni → Privacy e
  sicurezza), se il PC la supporta.

## Accesso

- ✅ Sul server accesso obbligatorio: password (Argon2id, almeno 12 caratteri) + codice
  TOTP; il codice vale una volta sola.
- ✅ Dopo 5 tentativi sbagliati in 15 minuti l'accesso si blocca (risposta 429).
- ✅ Sessione: token casuale in un cookie `HttpOnly`, `Secure`, `SameSite=Strict`; nel DB solo
  l'hash. Scade dopo 30 giorni, o 7 senza uso. «Esci da tutti i dispositivi» le chiude
  tutte; un nuovo setup pure.
- ✅ Richieste che modificano dati da un'origine estranea: rifiutate (403).
- ✅ Con l'accesso attivo la documentazione interattiva dell'API (`/docs`) è spenta.
- ✅ Dopo il login si torna solo a pagine della dashboard (niente redirect verso altri siti).

## Rete e browser

- ✅ In locale tutto ascolta solo su `localhost`; sul server la dashboard solo su
  `127.0.0.1`, il database su nessuna porta. Da fuori casa solo via Tailscale. ⚠️
- ✅ HTTPS ovunque: mkcert sul PC, certificati Tailscale sul server.
- ✅ `Host` ammessi in elenco (contro il DNS rebinding); CORS solo per l'indirizzo della
  dashboard.
- ✅ Intestazioni: `Content-Security-Policy` stretta sulla pagina (script solo dal sito più
  lo script del tema con il suo hash; nessuna violazione su tutte le pagine con grafici),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store` sulle API.

## Integrazioni

- ✅ Solo lettura: Trading 212 senza permesso «Orders»; Enable Banking solo AIS, elenco chiuso
  di endpoint (nessun pagamento possibile, test).
- ✅ Cambi BCE: download di un file pubblico, nessun dato nella richiesta.
- ✅ Errori verso l'esterno senza dettagli SQL, chiavi o IBAN.

## Dipendenze e codice

- ✅ Nessuna vulnerabilità nota: `pip-audit` (backend) e `pnpm audit --prod` (frontend).
- ✅ Versioni bloccate (`uv.lock`, `pnpm-lock.yaml`); immagine Docker con utente non root.
- ✅ Test: backend e frontend verdi; ruff, mypy strict, eslint, prettier puliti.

## Backup

- ✅ Backup automatico giornaliero cifrato, ultimi 30; prova di ripristino completa su un
  database di prova (27 tabelle, righe identiche al database vero), poi svuotato.
- ⚠️ Copia fuori dal server e copia di `backup.key` in un posto diverso: a mano (DEPLOY.md §8).

## Rischi che restano

- Chi ha accesso a un tuo dispositivo con Tailscale attivo e una sessione aperta vede la
  dashboard: blocca telefono e PC; in caso di furto «Esci da tutti i dispositivi» e togli il
  dispositivo da Tailscale.
- Il PC Windows non ha l'accesso con password (la dashboard lì è solo su `localhost`).
- Le credenziali di banche e broker restano valide finché non le revochi: in caso di
  sospetto, revoca la chiave Trading 212 e i consensi dal Control Panel di Enable Banking.
