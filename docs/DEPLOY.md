# Server di casa — guida all'installazione

La dashboard gira su un vecchio PC con Linux, sempre acceso, e si usa da PC e telefono
tramite **Tailscale**: una rete privata tra i tuoi dispositivi. Nessuna porta aperta sul
router, nessun indirizzo pubblico: da Internet il server non si vede.

```
telefono / PC ──(Tailscale, cifrato)──▶ server di casa
                                         ├─ tailscale serve (HTTPS *.ts.net)
                                         └─ Docker: dashboard (127.0.0.1:8000) + PostgreSQL
```

## 1. Il server

- **Hardware:** basta poco (2 core, 4 GB di RAM, SSD da 64 GB in su). Meglio se consuma
  poco: resta acceso giorno e notte.
- **Sistema:** Debian 13 o Ubuntu Server 24.04 LTS, senza interfaccia grafica.
- **Cifratura del disco:** durante l'installazione scegli *disco cifrato (LUKS)*. Se il PC
  viene rubato, i dati non si leggono. (All'avvio chiede la passphrase: se vuoi che riparta
  da solo dopo un blackout serve lo sblocco automatico con TPM — se ne parla insieme.)
- **Utente** normale con `sudo`; accesso SSH **solo con chiave**, password disattivate
  (`PasswordAuthentication no` in `/etc/ssh/sshd_config`).
- **Aggiornamenti automatici di sicurezza:** `sudo apt install unattended-upgrades`.

## 2. Docker e Tailscale

```sh
# Docker Engine + compose (guida ufficiale: https://docs.docker.com/engine/install/)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # poi esci e rientra

# Tailscale (https://tailscale.com/download/linux)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Nel pannello di Tailscale (login.tailscale.com → **DNS**) attiva **MagicDNS** e
**HTTPS Certificates**. Il server avrà un nome tipo `finanze.tailnet-1234.ts.net`
(rinominalo in *Machines* se vuoi).

## 3. Il codice

Clona il repository (se è un tuo fork privato: *deploy key* di sola lettura in
GitHub → repository → Settings → Deploy keys, oppure `gh auth login`).

```sh
git clone https://github.com/<utente>/finance-dashboard.git
cd finance-dashboard/deploy
cp .env.example .env
nano .env
```

In `deploy/.env`:
- `POSTGRES_PASSWORD`, `DB_PASSWORD`: due password diverse, solo lettere e cifre
  (`openssl rand -hex 24`);
- `ALLOWED_HOSTS`, `CORS_ORIGINS`, `EB_REDIRECT_URL`: con il nome Tailscale del server;
- `OWNER_NAMES`, `HOME_PLACES`: gli stessi di `backend/.env` sul PC;
- `AUTH_ENABLED=true` (sul server l'accesso è obbligatorio).

`deploy/.env` non va mai in Git (è già escluso).

## 4. Chiavi e credenziali dal PC

Copia dal PC (`D:\FinanceData\secrets\`) al server, in `deploy/data/secrets/`
(per esempio con una chiavetta o `scp` via Tailscale):

| File | A cosa serve |
|---|---|
| `app.key` | decifra i consensi bancari salvati: senza, le banche vanno ricollegate |
| `backup.key` | apre i backup |
| `trading212.env` | chiave di Trading 212 |
| `enablebanking.env`, `enablebanking-prod.pem` | applicazione Enable Banking |

**Non** copiare `db.env` né `tls/` né `mkcert/`: sul server il database e l'HTTPS sono altri.

```sh
mkdir -p data/secrets data/backups data/logs
sudo chown -R 10001:10001 data          # l'utente della dashboard nel container
chmod 700 data/secrets && chmod 600 data/secrets/*
```

## 5. Primo avvio e trasloco dei dati

```sh
docker compose up -d --build            # la prima volta impiega qualche minuto
docker compose logs -f app              # Ctrl+C per uscire
```

Per portare i dati del PC: sul PC crea un backup
(`uv run python -m app.backup.cli create --verify` nella cartella `backend`), copia il file
`.fdbk` più recente in `deploy/data/backups/` del server, poi:

```sh
docker compose exec app python -m app.backup.cli restore /data/backups/NOME.fdbk --yes
docker compose restart app
```

(Senza dati da portare: `docker compose exec app python -m app.db.seed` una sola volta.)

## 6. Accesso con password e codice

```sh
docker compose exec -it app python -m app.auth.cli setup
```

Scegli la password (almeno 12 caratteri) e inquadra il QR con l'app di autenticazione
(Google Authenticator, Microsoft Authenticator, Aegis, 1Password…). Senza questo passo la
dashboard risponde «Accesso attivo ma non configurato».

## 7. Raggiungerla da telefono e PC

```sh
sudo tailscale serve --bg 8000
```

Ora `https://finanze.tailnet-1234.ts.net` funziona da ogni dispositivo collegato al tuo
Tailscale (installa l'app Tailscale sul telefono, stesso account). Il certificato HTTPS è
valido e lo rinnova Tailscale.

**Enable Banking:** nel Control Panel aggiungi il nuovo indirizzo di ritorno
`https://finanze.tailnet-1234.ts.net/impostazioni/ritorno-banca` (puoi tenere anche quello
di localhost). I consensi già dati restano validi: basta aver copiato `app.key`.

**Sul PC Windows:** da quando usi il server, non lasciare acceso anche il backend locale.
Due copie sincronizzerebbero le stesse banche, e le banche concedono al massimo 4 letture
al giorno senza di te.

## 8. Backup

- Automatici ogni `BACKUP_HOURS` ore (24) in `deploy/data/backups/`, gli ultimi
  `BACKUP_KEEP` (30). Cifrati con `backup.key`.
- **Una copia fuori dal server**, almeno ogni settimana: chiavetta USB, un altro PC, o un
  cloud (il file è cifrato). Se il disco si rompe, quello che è solo sul server è perso.
- **`backup.key` va conservata anche altrove** (gestore di password, chiavetta): senza, i
  backup non si aprono. Mai nello stesso posto dei backup online.
- Ogni mese una prova di ripristino (non tocca i dati veri):
  `docker compose exec app python -m app.backup.cli verify`

## 9. Aggiornare

```sh
cd finance-dashboard && git pull
cd deploy && docker compose up -d --build
```

Le migrazioni del database partono da sole all'avvio. Prima di aggiornare conviene un
backup: `docker compose exec app python -m app.backup.cli create`.

## Problemi frequenti

| Sintomo | Causa probabile |
|---|---|
| «Host non consentito» (400) | il nome del server manca in `ALLOWED_HOSTS` |
| La pagina di accesso non lascia entrare e il codice è giusto | l'ora del server o del telefono è sbagliata (`timedatectl`) |
| Ritorno dalla banca in errore | il nuovo indirizzo non è registrato nel Control Panel, o `EB_REDIRECT_URL` è diverso |
| Banche «consenso scaduto» dopo il trasloco | `app.key` non copiata: ricollega le banche da Impostazioni |
| Backup non riuscito | `docker compose logs app`; spazio su disco (`df -h`) |
