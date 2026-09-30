# Kanflow worker (`kanflow-worker`)

The standalone worker runs Kanflow's background AI work **outside Next.js**:

- the JA/ID **translation queue** (`field_translation`, 5 s ticks, `FOR UPDATE SKIP LOCKED`)
- the daily **AI surveillance** run (it used to be a 15-minute HTTP request fired by a scheduled task)

It yields to people: whenever a user-facing AI call is running in any Kanflow web process, the
worker stops its current translation and waits.

## Deploy: read this first

> Deploying, installing and rolling back the worker is described **only** in
> [deploy.md](./deploy.md): Phase A (translation inside the web service,
> `AI_TRANSLATION_WORKER=inprocess`) → Phase C → **Phase B** (this worker as a service).
>
> `AI_TRANSLATION_WORKER` defaults to `external`: `next start` does **not** run the translation
> loop. Deploy a build with this default and without the worker service, and translations queue up
> (`status = pending`) until a worker runs. Nothing is lost. `/api/health` then reports
> `worker.status = "absent"` with `expected: true`, and `ops\status.ps1` and the watchdog warn.

### What the service runs

- `ops\worker\install-worker-service.js` registers `kanflow-worker` (SCM name `kanflowworker.exe`,
  winsw files and wrapper logs in `ops\worker\daemon\`).
- The service starts `node app\src\worker\service-entry.mjs`. That small plain-JS launcher loads the
  **pre-built bundle** `app\.next\worker\main.cjs`. No TypeScript and no `tsx` are loaded at runtime,
  so a half-edited `src\` tree or a dev-only `npm install` cannot change what production runs.
- `npm run build:worker` builds the bundle with esbuild into `<NEXT_DIST_DIR or .next>\worker\`. It
  runs after `next build`, into the same directory, so web and worker swap and roll back together
  (`ops\deploy\swap-build.ps1`). The build fails if the bundle would need a devDependency.
  `worker\BUILD_INFO.json` records the web BUILD_ID it was built with.
- If the bundle is missing, the service exits at once with
  `kanflow-worker: bundle not found ... npm run build:worker`.

### Install / uninstall (normally done by `deploy.ps1 -Phase B -InstallWorker`)

```bat
cd D:\APP\Kanflow\app
node src\worker\service-entry.mjs --dry-run      :: resolved config from the bundle; never touches the DB
cd D:\APP\Kanflow
node ops\worker\install-worker-service.js        :: needs app\.next\worker\main.cjs
sc query kanflowworker.exe
node ops\worker\uninstall-worker-service.js      :: remove (then AI_TRANSLATION_WORKER=inprocess + recover.bat)
```

`INTERNAL_API_TOKEN` must be set in `app\.env`, and the web service must be restarted after you set
it. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### Retire the old surveillance scheduled task

The worker runs surveillance itself (default **06:30** every day). Remove the old task so it does not
also trigger at the same time:

```powershell
Unregister-ScheduledTask -TaskName KanflowAiSurveillance -Confirm:$false
```

If you keep the task, it does no harm. Both paths take the MySQL named lock `kanflow_surveillance`,
so the second one skips. `POST /api/surveillance` returns **202 immediately**.

## Running by hand (development)

```bat
cd D:\APP\Kanflow\app
npm run worker                           :: TypeScript sources via tsx, foreground (Ctrl+C = graceful stop)
npm run worker -- --dry-run              :: print the config and exit; no DB access
npm run worker -- --surveillance-now     :: also start one surveillance run immediately
```

`npm run worker` is for development only. Always start from `app\`: the worker loads
`.env.production.local`, `.env.local`, `.env.production` and `.env` from the working directory, as
`next start` does. Real environment variables win over file values.

Only one worker runs per database. A second instance, for example a manual `npm run worker` while
the service runs, logs `another worker holds the lock; waiting as standby` and takes over when the
first one exits. A standby worker writes no heartbeat file.

## Configuration (`app\.env`)

| Variable | Default | Meaning |
|---|---|---|
| `AI_TRANSLATION_WORKER` | `external` | `external`: only the worker translates. `inprocess`: every `next start` runs the loop, as before (legacy `true` also means this). `off`: nobody translates (legacy `false`). If this is `inprocess`, the worker skips translation and runs only scheduled jobs. |
| `AI_TRANSLATION_WORKER_IN_DEV` | unset | `next dev` runs the in-process loop only if this is `true` **and** the mode is `inprocess`. |
| `INTERNAL_API_TOKEN` | unset | Shared secret for `GET /api/internal/ai-busy` (`x-internal-token` header). **Required** in the web and worker env. Without it peers answer 503 and the worker runs throttled (see below). |
| `AI_GATE_PEERS` | `http://127.0.0.1:${PORT:-3000}` | Comma-separated web base URLs the worker yields to. Add `http://127.0.0.1:3001` when a dev server shares the DB and Ollama. `none` disables polling. |
| `AI_GATE_POLL_MS` | `1000` | Peer poll interval. |
| `AI_GATE_TIMEOUT_MS` | `800` | Timeout for each probe. |
| `AI_GATE_QUIET_MS` | `3000` | A peer idle for less than this still counts as busy. |
| `AI_GATE_MAX_BACKOFF_MS` | `30000` | Maximum re-probe delay for an unreachable peer. |
| `AI_GATE_DEGRADED_INTERVAL_MS` | `30000` | While a peer is unreachable, at most one translation row per interval. |
| `SURVEILLANCE_SCHEDULE` | `06:30` | Local `HH:MM` times, comma-separated (`06:30,18:00`). `off` disables. Missed slots are not caught up. |
| `SURVEILLANCE_RETENTION_DAYS` | `90` | AI reports older than this are deleted at the start of each surveillance run. |
| `SURVEILLANCE_YIELD_MAX_MS` | `600000` | Before each project investigation, the scheduled run waits up to this long for busy web users. |
| `WORKER_HEARTBEAT_MS` | `60000` | Heartbeat log line, heartbeat file and lock-ownership check. |
| `WORKER_HEARTBEAT_FILE` | `<LOG_DIR>\worker-heartbeat.json` | Liveness file rewritten every heartbeat and deleted on graceful stop. `/api/health` (`worker`), the watchdog and `ops\status.ps1` read it. `LOG_DIR` defaults to `app\logs`. |
| `WORKER_HEARTBEAT_STALE_MS` | `3 x WORKER_HEARTBEAT_MS` | Readers treat the file as `stale` after the larger of this and three intervals. |
| `WORKER_BUSINESS_HOURS` | `08:00-17:30` | Local office-hours window for the background-translation throttle. `off` disables it. |
| `WORKER_BUSINESS_DAYS` | `1-5` | ISO weekdays of the window (1 = Mon … 7 = Sun), for example `1-6` or `1,3,5`. |
| `WORKER_BUSINESS_HOURS_RATE` | `6` | Maximum background translations per rolling minute inside the window. `0` pauses them. User AI calls are never throttled. |
| `KANFLOW_WORKER_BUNDLE` | `.next\worker\main.cjs` | Bundle loaded by `service-entry.mjs` (relative to `app\`). Used for testing a side build, e.g. `.next-new\worker\main.cjs`. |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | `25000` | Graceful-stop budget. Must be below the service's `stoptimeout` of 35 s. |
| `SURVEILLANCE_TOKEN` | unset | Unchanged: protects the manual `POST /api/surveillance` trigger. |

## How it works

### Cross-process priority gate

Each process has an in-process `PriorityGate` (`lib/translation/priority-gate.ts`). A user AI call
enters it as high priority and aborts background translation in **that** process. The worker is a
separate process, so it needs to know when a user in any web process is waiting.

- Every web process serves `GET /api/internal/ai-busy`. The endpoint accepts only loopback
  `Host`, a non-proxied request and a constant-time token compare. It returns
  `{ busyHigh, idleForMs }`, answers in O(1) and never waits.
- The worker polls each peer (`lib/ai-gate/remote-gate.ts`). While any peer is busy, or went idle
  less than `AI_GATE_QUIET_MS` ago, the worker **mirrors** that into its own gate as a
  `beginHigh({ remote: true })` entry. That aborts the running Ollama request: the row goes back
  to `pending` and its attempts are unchanged. It also keeps new background work out until the
  peer is idle again. The translation loop itself does not know about other processes.
- Mirrored entries are **not** counted in `busyHigh`. Two processes that watch each other can
  therefore never latch each other busy.

Failure policy:

- **Users never wait on the worker.** Web processes only read a counter.
- **The worker fails safe.** If a peer is unreachable, it is treated as *not busy* and the worker
  keeps going, but in `degraded` mode: at most one row per `AI_GATE_DEGRADED_INTERVAL_MS`. The peer
  is re-probed with exponential backoff (1 s, 2 s, 4 s … up to 30 s). A warning is logged once per
  outage, not on every probe.

Why HTTP rather than MySQL `GET_LOCK` for the gate: a named lock belongs to a DB session, and
Prisma pools its connections. Holding one per user call would need a dedicated connection per
in-flight chat. The worker would have to poll `IS_USED_LOCK` and could only see one holder, not a
count or a quiet window. A crashed web process would also leave the lock held until MySQL notices
the dead session. The HTTP probe costs nothing for users, reports a count and a quiet window, and
fails cleanly in both directions.

Ollama is also shared with another application on this PC. Kanflow cannot coordinate with it, so
the worker stays polite: one row at a time, and it yields immediately to Kanflow users.

### Single instance, heartbeat, shutdown

- **Single instance:** `SELECT GET_LOCK('kanflow_worker', 0)` runs on a **dedicated `mariadb`
  connection** (`src/worker/dedicated-lock.ts`, settings from `DATABASE_*`, else `DATABASE_URL`). It
  does not use Prisma's pool (5 connections) and opens no transaction. No table is touched and there
  is no schema change. The lock ends with the session, so a crashed worker never blocks its
  successor. The earlier design held the lock inside a Prisma interactive transaction. That pinned
  one pooled connection and forced a reconnect when the transaction timeout of about **23 days**
  (2e9 ms) fired. That periodic reconnect no longer happens. The 60-second verify query keeps the
  session well inside MySQL's `wait_timeout` (8 h). The connection also uses TCP keep-alive.
- **Heartbeat** (every 60 s): re-checks `IS_USED_LOCK(...) = CONNECTION_ID()` on the dedicated
  connection. If the lock was lost (connection dropped), the worker shuts down with exit code 1 and
  the service restarts it. It rewrites the heartbeat file (`app\logs\worker-heartbeat.json`: pid,
  times, translation mode and last tick, gate state, business-hours state, web BUILD_ID, no
  secrets). It also logs gate state, the last translation tick, the business-hours budget used, the
  running surveillance job and the next scheduled run to `app\logs\worker-YYYY-MM-DD.log`.
  `/api/health` reports `worker: ok | stale | absent` from the file's age. The watchdog restarts
  `kanflowworker.exe` if the service is stopped or the file is stale (only when
  `AI_TRANSLATION_WORKER=external`).
- **Business hours:** inside `WORKER_BUSINESS_HOURS` on `WORKER_BUSINESS_DAYS`, the admission hook
  combines the AI gate with a rolling-minute budget of `WORKER_BUSINESS_HOURS_RATE` rows. Only rows
  that were actually translated count, so an idle queue does not use up the budget. This keeps
  model reloads and GPU contention low while people, and BankMasalah on the same Ollama, are
  working. Keep `OLLAMA_NUM_CTX` equal to Ollama's `OLLAMA_CONTEXT_LENGTH` and BankMasalah's num_ctx
  (see deploy.md).
- **Graceful shutdown** starts on SIGINT, SIGTERM, SIGBREAK (Ctrl+Break), SIGHUP, or the IPC
  `shutdown` message that node-windows sends because of `stopparentfirst`. The steps run in this
  order:
  1. cancel start-up or standby
  2. stop the heartbeat
  3. abort the surveillance job (the current project's report is not saved)
  4. stop translation: no new ticks, abort the in-flight Ollama request, return claimed rows to
     `pending`
  5. stop the scheduler
  6. wait for jobs to finish
  7. stop the gate
  8. `RELEASE_LOCK`
  9. `prisma.$disconnect()`
  10. flush logs, then exit

  A failing step is logged and the next step still runs. If the whole sequence takes longer than
  `WORKER_SHUTDOWN_TIMEOUT_MS`, the process exits with code 1. A second Ctrl+C exits immediately.
  Rows left in `running` by a hard kill are reset by the existing 5-minute stale sweep.

### Surveillance

The logic moved from `app/api/surveillance/route.ts` to `src/worker/jobs/surveillance.ts`.

- **History is kept.** A new report no longer deletes the project's previous reports. Only reports
  older than `SURVEILLANCE_RETENTION_DAYS` (all projects) are removed. The project dashboard lists
  the latest 10 reports.
- The follow-up logic is unchanged: the newest report of any trigger is followed up.
- **Exclusive across processes:** the MySQL named lock `kanflow_surveillance`. Inside one web
  process, an in-memory single-flight mutex also applies.
- **Manual trigger:**
  `POST /api/surveillance` with header `x-surveillance-token` returns
  `202 { jobId, alreadyRunning }`. To check a job, call
  `GET /api/surveillance?jobId=<id>` with the same header. Job records live in the memory of the
  web process that ran them.
- **One retention setting:** `SURVEILLANCE_RETENTION_DAYS` (alias `AI_REPORT_RETENTION_DAYS`,
  default 90) drives the only AiReport deletion (the sweep at the start of each run). The old
  `maintainAiReports()` (3-day deletion) was removed.
- **Legacy JA/ID conversion runs again:** after the retention sweep, each run converts up to 50
  single-language reports to JA/ID bilingual (`convertLegacyAiReports`, best effort; it waits
  for busy web users first and never deletes anything).

## Troubleshooting

| Symptom | Check |
|---|---|
| Translations stay `pending` | `ops\status.ps1` (worker heartbeat, translation backlog). Then `sc query kanflowworker.exe`, and look for `heartbeat` in `app\logs\worker-*.log`. Check that `AI_TRANSLATION_WORKER` is not `inprocess` or `off` unless intended. During business hours the throttle allows only `WORKER_BUSINESS_HOURS_RATE` rows per minute. |
| `/api/health` → `worker.status: "stale"` | The worker hung or was killed hard. The watchdog restarts it within 5 minutes; to restart by hand, run `sc stop kanflowworker.exe` then `sc start kanflowworker.exe`. |
| Service stops immediately, `bundle not found` in `ops\worker\daemon\kanflowworker.err.log` | `.next\worker\main.cjs` is missing because the build was deployed without `npm run build:worker`. Re-deploy with `deploy.ps1`. |
| `ai-gate peer unreachable` in the worker log | The web service is down, `INTERNAL_API_TOKEN` differs or is missing in `.env`, or `AI_GATE_PEERS` is wrong. Test with: `curl -H "x-internal-token: <token>" http://127.0.0.1:3000/api/internal/ai-busy` |
| `another worker holds the lock; waiting as standby` | Another worker (service or manual) is running. This is expected. |
| `single-instance lock lost` | The MySQL connection dropped. The service restarts the worker automatically. |
| Chat feels slow while translations run | Lower `AI_GATE_POLL_MS`. A user call is detected within about one poll interval plus the probe time. |

## Timestamps (UTC) — fixed 2026-09-29

`field_translation.requested_at` / `updated_at` used to be written with MySQL `NOW(3)` (server local time, UTC+7) while Prisma writes `started_at`, `translated_at` and retry schedules in UTC. Effects: retry backoff was ineffective (retries were due immediately) and queue-age figures were off by 7 h. All writes and the claim query now use `UTC_TIMESTAMP(3)`. Rows written by older builds may still carry local time; the worker pulls any pending row scheduled more than `FUTURE_REQUEST_TOLERANCE_MS` (backoff max + 10 min) ahead back to "now" on every tick, so nothing is held back after deploy. Historical `done` rows are left as-is (their timestamps are informational only).
