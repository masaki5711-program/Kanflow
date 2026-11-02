# Kanflow app (Next.js)

Next.js 16 + React 19 + Prisma 7 (PostgreSQL 16 via `@prisma/adapter-pg`; platform image
`timescale/timescaledb:2.28.1-pg16`). **The production server stays on MySQL 8.4 with its own
checkout until the approved cutover (MR K2)** - this version cannot run against MySQL.
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

- **PostgreSQL 16.** Local / test database: `docker compose -f ../ops/test-env/compose.yml up -d --wait`
  (127.0.0.1:25434, synthetic credentials `kanflow_dev` / `kanflow_dev` / `scrum_tool`, UTF-8 + ICU `und`
  collation). Point `.env` at it (`DATABASE_URL=postgresql://...` and the matching `DATABASE_*`).
- Migrations: `prisma/migrations/` is the PostgreSQL history, starting with the baseline `0_init`
  (re-created from the schema, not translated; it also creates the `citext` and `pg_trgm` extensions).
  `prisma/migrations-mysql/` holds the 58 frozen MySQL migrations the production server keeps applying
  until the cutover - never edit them, never add to them, never point the CLI at them from this version.
- Schema: `prisma/schema.prisma`; client generated to `src/generated/prisma` (`npx prisma generate`, not committed).
- MySQL `utf8mb4_unicode_ci` compared text case-insensitively; PostgreSQL does not. Rules:
  user-facing text search uses `contains` with `mode: "insensitive"` (ILIKE); keys that must be unique
  regardless of case are `@db.Citext` (`User.email`, `User.employeeNumber`, `Section.name`,
  `AdminCategory.name`, `UserProjectCategory.name`); machine values (ids, hashes, git refs, paths) stay
  case-sensitive.
- Raw SQL (`$queryRaw` / `$executeRaw`): double-quote every camelCase / PascalCase identifier
  (`"ProductBacklogItem"."projectId"`; unquoted names fold to lower case), use `ON CONFLICT`, no
  `DELETE ... LIMIT`, `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')` for the UTC clock (columns are
  `timestamp(3)` holding UTC). A failed statement aborts the whole PostgreSQL transaction: best-effort
  writes AND reads inside a caller's transaction go through `bestEffort()`
  (`src/services/_shared/savepoint.ts`); a catch that swallows must rethrow
  `isFatalTxError(err)` (a failed ROLLBACK TO SAVEPOINT); `bestEffort` calls on one
  transaction must be sequential (never `Promise.all`).
- Search: terms of 3+ characters take the trigram path; shorter terms (e.g. 「受入」)
  use the LIKE path, because pg_trgm has no usable trigram for them.
- Pool / session (`src/lib/prisma.ts`): `DATABASE_POOL_MAX` (10), `DATABASE_STATEMENT_TIMEOUT_MS`
  (30000), `DATABASE_LOCK_TIMEOUT_MS` (10000); every session runs with `TimeZone=UTC`.
- Named locks are advisory locks (`src/worker/named-lock.ts`, `dedicated-lock.ts`). Every raw-SQL site
  has a real-database test in `src/lib/__tests__/postgres.db.test.ts`.
- Real-database tests (skipped unless `KANFLOW_DB_TESTS=1`): `KANFLOW_DB_TESTS=1 npx vitest run src/lib/__tests__/postgres.db.test.ts src/services/dev-work/__tests__/dev-work.db.test.ts src/services/acceptance-criteria/__tests__/acceptance-criteria.db.test.ts src/services/feedback/__tests__/feedback.db.test.ts src/services/plan/__tests__/plan.base-schedule.db.test.ts`
- Schema changes: create a migration in development
  (`npx prisma migrate dev --name <change>`), commit `prisma/migrations/<ts>_<change>/`,
  and apply on the server with **`npx prisma migrate deploy`** (deploy.ps1 `-ApplyMigrations`).
  Do not use `prisma db push` against production - it bypasses migration history
  (that is how the drift fixed by `20260923000000_baseline_drift` happened).
- Drift checks (Prisma 7: the shadow DB comes from `SHADOW_DATABASE_URL` via
  `prisma.config.ts`; there is no `--shadow-database-url` flag and `--to-schema-datamodel`
  is now `--to-schema`):
  - migrations vs schema (needs a throw-away shadow DB; CI job `prisma-migrate-check` does this):
    `$env:SHADOW_DATABASE_URL="postgresql://kanflow_dev:kanflow_dev@127.0.0.1:25434/prisma_shadow"; npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`
    (create the empty shadow database first: `docker exec kanflow-v2-test-postgres-1 createdb -U kanflow_dev prisma_shadow`)
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
