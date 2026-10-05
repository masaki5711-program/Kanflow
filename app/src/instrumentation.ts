/**
 * Next.js server start hook.
 *
 * The background translation loop does NOT run in web processes by default:
 * it runs in the standalone worker (`npm run worker`, Windows service
 * `kanflow-worker`, see docs/operations/worker.md). Web processes only
 * answer GET /api/internal/ai-busy so that worker can yield to users.
 *
 * AI_TRANSLATION_WORKER=inprocess restores the old behaviour (loop inside
 * every `next start`); `next dev` additionally needs
 * AI_TRANSLATION_WORKER_IN_DEV=true. See lib/translation/worker-mode.ts.
 *
 * Background AI report jobs (lib/ai-jobs) follow the same rule unless
 * AI_JOB_RUNNER says otherwise: in `web` mode this process runs the job loop.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { logger } = await import("@/lib/logger")
  const log = logger.child({ module: "instrumentation" })
  await startTranslation(log)
  await startAiJobs(log)
  await startRequestMetrics(log)
  await startGitSync(log)
  await startWebDailyJobs(log)
}

type Log = { info(msg: string, fields?: Record<string, unknown>): void; warn(msg: string, fields?: Record<string, unknown>): void; error(msg: string, fields?: Record<string, unknown>): void }

async function startTranslation(log: Log): Promise<void> {
  const { decideInProcessWorker } = await import("@/lib/translation/worker-mode")
  const decision = decideInProcessWorker(process.env)
  if (!decision.start) {
    if (decision.mode === "external" && process.env.NODE_ENV === "production") {
      log.warn("translation worker not started in this web process; make sure the kanflow-worker service is running", {
        reason: decision.reason,
      })
    } else {
      log.info("translation worker not started in this process", { reason: decision.reason })
    }
    return
  }
  const { startTranslationWorker } = await import("@/lib/translation/worker")
  startTranslationWorker()
  log.info("in-process translation worker started", { reason: decision.reason })
  // Optional: yield to user AI calls of OTHER web processes too (explicit peers only).
  if (process.env.AI_GATE_PEERS?.trim()) {
    const { createRemoteGate } = await import("@/lib/ai-gate")
    const { setWorkerAdmission } = await import("@/lib/translation/worker")
    const remote = createRemoteGate(process.env, log)
    remote.start()
    setWorkerAdmission(() => remote.admit())
  }
}

/** In-process AI job runner (AI_JOB_RUNNER=web, or auto with AI_TRANSLATION_WORKER=inprocess). */
async function startAiJobs(log: Log): Promise<void> {
  try {
    const { decideWebJobRunner } = await import("@/lib/ai-jobs/config")
    const decision = decideWebJobRunner(process.env)
    if (!decision.start) {
      log.info("ai job runner not started in this process", { reason: decision.reason })
      return
    }
    const { createAiJobRunner, loadAiJobRunnerConfig, waitForLocalGate } = await import("@/lib/ai-jobs")
    const { gate } = await import("@/lib/translation/priority-gate")
    const config = loadAiJobRunnerConfig(process.env)
    const quietMs = 3000
    const runner = createAiJobRunner({
      log,
      config,
      // No remote peers here: wait until no user AI call of THIS process is running.
      waitForTurn: (signal) => waitForLocalGate(() => gate.isIdle(quietMs), signal, config.yieldMaxMs),
    })
    runner.start()
    log.info("in-process ai job runner started", { reason: decision.reason })
  } catch (err) {
    log.error("ai job runner failed to start", { error: err instanceof Error ? err.message : String(err) })
  }
}

/** Request metrics + 5-minute MetricSnapshot timer (lib/metrics; METRICS_ENABLED=off disables). */
async function startRequestMetrics(log: Log): Promise<void> {
  try {
    const { startMetrics } = await import("@/lib/metrics/runtime")
    startMetrics(log)
  } catch (err) {
    log.error("metrics failed to start", { error: err instanceof Error ? err.message : String(err) })
  }
}

/** GitLab polling sync for projects with the Git integration on (lib/git/poller; GIT_SYNC=off disables). */
async function startGitSync(log: Log): Promise<void> {
  try {
    const { shouldStartGitPoller, startGitPoller } = await import("@/lib/git/poller")
    const decision = shouldStartGitPoller(process.env)
    if (!decision.start) {
      log.info("git sync not started in this process", { reason: decision.reason })
      return
    }
    startGitPoller()
    log.info("git sync poller started", { reason: decision.reason })
  } catch (err) {
    log.error("git sync failed to start", { error: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * The worker's daily housekeeping (due-date notifications, retention sweeps,
 * 定着確認 reminders — worker/collab-daily.ts) inside the web process, for
 * installs without the standalone kanflow-worker service. WEB_DAILY_JOBS:
 * auto (default) = only when the translation loop also runs in-process
 * (AI_TRANSLATION_WORKER=inprocess, i.e. no worker), on, off. Every step is
 * idempotent (dedupe keys / notifiedAt), so an overlap with a worker is harmless.
 */
async function startWebDailyJobs(log: Log): Promise<void> {
  try {
    const mode = (process.env.WEB_DAILY_JOBS ?? "auto").toLowerCase()
    const inprocess = (process.env.AI_TRANSLATION_WORKER ?? "").toLowerCase() === "inprocess"
    const start = mode === "on" || (mode === "auto" && inprocess && process.env.NODE_ENV === "production")
    if (!start) {
      log.info("daily jobs not started in this web process", { mode })
      return
    }
    const { loadWorkerConfig } = await import("@/worker/config")
    const { startCollabScheduler } = await import("@/worker/collab-daily")
    startCollabScheduler(loadWorkerConfig(process.env), log)
  } catch (err) {
    log.error("daily jobs failed to start", { error: err instanceof Error ? err.message : String(err) })
  }
}
