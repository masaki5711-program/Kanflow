# Kanflow — Rancher Desktop / Docker Compose deployment

This guide builds and runs Kanflow on Rancher Desktop using `docker compose`.
The same compose file works on plain Docker Engine (Linux) without changes.

## Architecture

```
┌──────────────── Host (Windows/macOS/Linux) ────────────────┐
│                                                            │
│  Ollama (host process, uses GPU)  ── http://host:11434     │
│                                                            │
│  ┌─────────── Rancher Desktop / Docker ─────────────────┐  │
│  │                                                      │  │
│  │  kanflow-app  ──► db (MySQL 8.4)                     │  │
│  │       │                                              │  │
│  │       └────► collabora (LibreOffice Online)          │  │
│  │       │                                              │  │
│  │       └────► host.docker.internal:11434 (Ollama)     │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

| Component | Where        | Why                                                |
| --------- | ------------ | -------------------------------------------------- |
| Next.js   | container    | Stateless app, easy to roll forward                |
| MySQL     | container    | Persisted via the `kanflow_mysql_data` volume      |
| Collabora | container    | Self-contained, mounts a config from the repo      |
| Ollama    | **host**     | Uses the GPU directly — Rancher Desktop can't pass GPU through to k3s containers reliably |

---

## 1. Prerequisites

1. **Rancher Desktop** with the `dockerd (moby)` engine selected (Settings →
   Container Engine → dockerd).
2. **Ollama for Windows** installed on the host (https://ollama.com/download).
3. The Qwen models pulled on the host:
   ```powershell
   ollama pull qwen2.5vl:7b
   ollama pull qwen3.6:27b-q4_K_M
   ```
4. Recommended Ollama env vars on the host (see `install-watchdog.bat` for
   how the standalone deployment sets these):
   ```
   OLLAMA_HOST            = 0.0.0.0:11434       # accept LAN connections
   OLLAMA_KEEP_ALIVE      = 168h                 # keep model resident
   OLLAMA_NUM_PARALLEL    = 2                    # 2 concurrent slots
   OLLAMA_MAX_LOADED_MODELS = 1                  # swap on demand to fit 24 GB
   ```

> The app container reaches Ollama via `host.docker.internal:11434`. On Linux
> Docker Engine the `extra_hosts: host.docker.internal:host-gateway` line in
> the compose file makes that work too.

## 2. First-time setup

```bash
# 1. Copy the env template and fill in passwords / secrets
cp .env.docker.example .env

# 2. Generate a NextAuth secret
openssl rand -base64 32   # paste into NEXTAUTH_SECRET in .env
```

Edit `.env` to set:
- `MYSQL_ROOT_PASSWORD` and `MYSQL_APP_PASSWORD` (any strong values)
- `NEXTAUTH_SECRET`
- `COLLABORA_ADMIN_PASSWORD`
- `NEXTAUTH_URL` and `APP_EXTERNAL_URL` if using a hostname other than localhost
  (e.g. `http://10.107.39.36:3000` for LAN access)

## 3. Build & start

```bash
# From the repo root
docker compose build
docker compose up -d

# Watch the app start (migrations run automatically on first boot)
docker compose logs -f app
```

Expected log lines:
```
Waiting for MySQL at db:3306...
MySQL is ready.
Running database migrations...
Migrations complete.
Starting Next.js server...
✓ Ready in xxxms
```

Open http://localhost:3000 (or your LAN URL).

## 4. Common operations

### Pull updates and redeploy

```bash
git pull
docker compose build app
docker compose up -d app
# Migrations run automatically; existing volumes are kept.
```

### Inspect / connect to the database

```bash
docker compose exec db mysql -u root -p
```

### Backup the database

```bash
docker compose exec db mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction "$MYSQL_DATABASE" > backups/kanflow-$(date +%F).sql
```

### Backup attachment volume

```bash
# Copy the live volume content to a tarball on the host
docker run --rm -v kanflow_app_uploads:/data \
  -v "$(pwd)/backups":/out alpine \
  tar -C /data -czf /out/uploads-$(date +%F).tar.gz .
```

### Tail logs

```bash
docker compose logs -f          # everything
docker compose logs -f app      # just the app
docker compose logs -f db       # just MySQL
```

### Reset everything (destructive)

```bash
docker compose down -v          # also removes volumes — deletes ALL data
```

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `app` exits with `Missing required environment variables` | `.env` not present or incomplete | Re-copy `.env.docker.example` and fill in every value |
| `app` health check fails for >1 min | DB not ready or migration failed | `docker compose logs app` — first run can take 60–90 s |
| Translation calls return errors | Ollama not running on host | Start Ollama, verify `curl http://localhost:11434/api/version` returns 200 |
| Translation slow / GPU 100% | Both Qwen models loaded simultaneously | Set `OLLAMA_MAX_LOADED_MODELS=1` on the host |
| `host.docker.internal` not reachable from app | Linux Docker without Docker Desktop | The `extra_hosts: host.docker.internal:host-gateway` entry handles this; ensure Docker ≥ 20.10 |
| Collabora can't open documents | `collabora-coolwsd.xml` missing | Ensure `./collabora-coolwsd.xml` exists in the repo root before `up` |

## 6. Production hardening checklist

- [ ] Replace `localhost` URLs with the real reachable hostname / FQDN
- [ ] Put a reverse proxy (Caddy, nginx, Traefik) in front of `app:3000` for HTTPS
- [ ] Restrict the MySQL port (`127.0.0.1:3306` already, raise to internal-only if a proxy connects on the bridge)
- [ ] Schedule daily DB + uploads backup via cron / Task Scheduler
- [ ] Pin image tags (`mysql:8.4.x`, `collabora/code:24.x`) instead of `latest`
- [ ] Configure `OLLAMA_HOST` watchdog so the LLM stays available
