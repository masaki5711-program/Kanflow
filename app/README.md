# Kanflow app (Next.js)

Next.js 16 + React 19 + Prisma 7 (MySQL 8.4 via `@prisma/adapter-mariadb`).
Operations (services, backups, watchdog) are documented in the repo root
[README.md](../README.md) and [docs/operations/](../docs/operations/).
**Deploy and rollback: [docs/operations/deploy.md](../docs/operations/deploy.md)** (the only authoritative procedure).

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server (use `-- -p 3001` when the production service already owns :3000) |
| `npm run build` | Production build (`next build --webpack`). On the server ALWAYS build into a side dir: `$env:NEXT_DIST_DIR=".next-new"; npm run build` (or let `ops\deploy\deploy.ps1` do it) |
| `npm run build:worker` | Bundle the standalone worker (`src/worker/main.ts`, esbuild) into `<NEXT_DIST_DIR or .next>/worker/main.cjs`. Run AFTER `npm run build` with the same `NEXT_DIST_DIR` (next build empties its dist dir). Fails if the bundle would need a devDependency. |
| `npm run worker` | **Dev only**: run the worker from TypeScript sources via tsx (`-- --dry-run`, `-- --surveillance-now`). The Windows service runs the bundle instead. |
| `npm start` | `next start` (production is started by the `kanflow.exe` Windows service, not by hand) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (ignores `.next*/`, `src/generated/`) |
| `npm test` | Vitest (`src/**/*.test.ts`) |

## Environment

Copy `.env.example` to `.env`. It lists every variable the code reads, with
defaults and comments. Required in production: `DATABASE_*` (+ `DATABASE_URL`
for the Prisma CLI), `AUTH_SECRET` (or `NEXTAUTH_SECRET`), `WOPI_ACCESS_TOKEN`,
`SURVEILLANCE_TOKEN`; with the external worker also `INTERNAL_API_TOKEN`.
Never commit `.env`.

## Database / Prisma

- Schema: `prisma/schema.prisma`; client generated to `src/generated/prisma` (`npx prisma generate`, not committed).
- Schema changes: create a migration in development
  (`npx prisma migrate dev --name <change>`), commit `prisma/migrations/<ts>_<change>/`,
  and apply on the server with **`npx prisma migrate deploy`** (deploy.ps1 `-ApplyMigrations`).
  Do not use `prisma db push` against production - it bypasses migration history
  (that is how the drift fixed by `20260923000000_baseline_drift` happened).
- Drift checks (Prisma 7: the shadow DB comes from `SHADOW_DATABASE_URL` via
  `prisma.config.ts`; there is no `--shadow-database-url` flag and `--to-schema-datamodel`
  is now `--to-schema`):
  - migrations vs schema (needs a throw-away shadow DB; CI job `prisma-migrate-check` does this):
    `$env:SHADOW_DATABASE_URL="mysql://root:pw@127.0.0.1:33999/shadow"; npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`
  - live DB vs schema (**read-only**, safe on production):
    `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
    (`--exit-code`: 0 = identical, 2 = different)
  - applied vs pending migrations (read-only): `npx prisma migrate status`
- There is no seed script. The first admin user is created once by hand (see root README).

## Health endpoint

`GET /api/health` (no auth, no secrets) returns

```json
{ "status": "ok", "db": "ok", "ollama": "ok",
  "worker": { "status": "ok|stale|absent", "heartbeatAgeSec": 12, "expected": true, "mode": "external" },
  "translation": { "pending": 0, "oldestPendingAgeSec": null, "running": 0, "failed": 4 },
  "uptime": 123, "buildId": "<.next/BUILD_ID>" }
```

200 when `SELECT 1` succeeds within 3 s, otherwise 503. Everything else is
informational (never changes the status code). `worker` comes from the worker's
heartbeat file (`logs/worker-heartbeat.json`, rewritten every 60 s). Used by
`ops/watchdog` and `ops/status.ps1`. Any auth middleware / `src/proxy.ts` must
exclude `/api/health`.

## Windows services

- Web: `setup-windows-service.js` registers the node-windows service (id `kanflow.exe`,
  display name "Kanflow") running `next start -H 0.0.0.0 -p 3000` in this folder. Its
  wrapper and logs live in `..\ops\web\daemon\` (outside node_modules). Installs from
  before 2026-09 kept them in `node_modules/next/dist/bin/daemon/` - move them with
  `..\ops\web\migrate-service-wrapper.ps1`. Uninstall: `node uninstall-windows-service.js`.
- Worker: `..\ops\worker\install-worker-service.js` (service `kanflowworker.exe`) runs
  `src/worker/service-entry.mjs`, which loads the pre-built `.next/worker/main.cjs`.
- Restart with the repo-root `recover.bat`, not `Restart-Service` (orphaned
  `next start` can keep :3000 and cause an EADDRINUSE loop).
