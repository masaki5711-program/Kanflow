import { createLogger, type Logger } from "@/lib/logger"
import { aiLogFlush } from "@/lib/ai-monitor"
import { prisma } from "@/lib/prisma"
import { createRemoteGate, type RemoteGate } from "@/lib/ai-gate"
import { setWorkerAdmission, startTranslationWorker, stopTranslationWorker, workerStatus } from "@/lib/translation/worker"
import { describeConfig, type WorkerConfig } from "./config"
import { removeHeartbeatFile, writeHeartbeatFile, type WorkerHeartbeat } from "@/lib/ai-gate/worker-heartbeat"
import { acquireSingleInstance } from "./instance-guard"
import type { NamedLockHandle } from "./named-lock"
import { acquireDedicatedLock, createLockConnect } from "./dedicated-lock"
import { BusinessHoursLimiter, combineAdmissions, isWithinBusinessHours } from "./business-hours"
import { DailyScheduler } from "./scheduler"
import { createShutdown, type ShutdownCoordinator, type ShutdownStep } from "./shutdown"
import { SingleFlightJobRunner } from "./jobs/job-runner"
import { runSurveillance, type SurveillanceResult } from "./jobs/surveillance"
import { startCollabScheduler } from "./collab-daily"
import { startPurgeTrashScheduler } from "./trash-daily"

/**
 * Standalone worker runtime: single-instance lock (own DB connection) →
 * cross-process AI gate + business-hours throttle → translation loop →
 * surveillance schedule → heartbeat (log line + liveness file). Everything is
 * torn down in reverse by one ordered shutdown sequence.
 */

export interface RunWorkerOptions {
  /** Start one surveillance run right after start-up (`--surveillance-now`). */
  surveillanceNow: boolean
  envFiles: string[]
}

const STANDBY_RETRY_MS = 30_000

interface Runtime {
  cfg: WorkerConfig
  log: Logger
  startup: AbortController
  jobs: SingleFlightJobRunner<SurveillanceResult>
  lock: NamedLockHandle | null
  remote: RemoteGate | null
  scheduler: DailyScheduler | null
  /** Retention sweep + due-date notifications (collab-daily.ts). */
  collabScheduler: DailyScheduler | null
  /** Daily purge of rows past the trash retention (trash-daily.ts). */
  trashScheduler: DailyScheduler | null
  heartbeat: ReturnType<typeof setInterval> | null
  limiter: BusinessHoursLimiter
  startedAt: string
}

/** BUILD_ID of the web build this bundle was built with (inlined by build-worker.mjs; unset under tsx). */
const WEB_BUILD_ID = process.env.KANFLOW_WORKER_WEB_BUILD_ID ?? null

function heartbeatPayload(rt: Runtime): WorkerHeartbeat {
  const w = workerStatus()
  const now = new Date()
  const bh = rt.cfg.businessHours
  return {
    v: 1,
    pid: process.pid,
    startedAt: rt.startedAt,
    writtenAt: now.toISOString(),
    intervalMs: rt.cfg.heartbeatMs,
    translation: {
      mode: rt.cfg.translationMode,
      runHere: rt.cfg.runTranslation,
      lastTickAt: w.lastTickAt ? new Date(w.lastTickAt).toISOString() : null,
      lastResult: w.lastResult,
    },
    gate: rt.remote?.snapshot().state ?? "idle",
    businessHours: bh ? (isWithinBusinessHours(bh, now) ? "open" : "closed") : "off",
    webBuildId: WEB_BUILD_ID,
  }
}

function touchHeartbeat(rt: Runtime): void {
  try {
    writeHeartbeatFile(rt.cfg.heartbeatFile, heartbeatPayload(rt))
  } catch (err) {
    rt.log.warn("could not write heartbeat file", { file: rt.cfg.heartbeatFile, error: err instanceof Error ? err.message : String(err) })
  }
}

function shutdownSteps(rt: Runtime): ShutdownStep[] {
  return [
    { name: "cancel-startup", run: () => rt.startup.abort() },
    {
      name: "stop-heartbeat",
      run: () => {
        if (rt.heartbeat) clearInterval(rt.heartbeat)
        if (rt.lock) removeHeartbeatFile(rt.cfg.heartbeatFile)
      },
    },
    { name: "abort-surveillance", run: () => rt.jobs.abort(new Error("worker shutting down")) },
    {
      name: "stop-translation",
      run: async () => {
        const drained = await stopTranslationWorker({ timeoutMs: Math.floor(rt.cfg.shutdownTimeoutMs / 2) })
        if (!drained) throw new Error("in-flight translation did not finish in time (rows are reset by the 5-min stale sweep)")
      },
    },
    { name: "stop-scheduler", run: () => rt.scheduler?.stop() },
    { name: "stop-collab-scheduler", run: () => rt.collabScheduler?.stop() },
    { name: "stop-trash-scheduler", run: () => rt.trashScheduler?.stop() },
    { name: "await-jobs", run: () => rt.jobs.settled() },
    {
      name: "stop-ai-gate",
      run: () => {
        setWorkerAdmission(null)
        rt.remote?.stop()
      },
    },
    { name: "release-lock", run: () => rt.lock?.release() },
    { name: "disconnect-db", run: () => prisma.$disconnect() },
    { name: "flush-logs", run: () => Promise.all([aiLogFlush(), rt.log.flush()]) },
  ]
}

function installSignalHandlers(shutdown: ShutdownCoordinator, log: Logger): void {
  const onSignal = (reason: string) => {
    if (shutdown.triggered) {
      log.error("second shutdown request; exiting immediately", { reason })
      process.exit(1)
    }
    void shutdown.trigger(reason, 0)
  }
  for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"] as const) process.on(sig, () => onSignal(sig))
  // node-windows (stopparentfirst) asks the child to stop over IPC.
  process.on("message", (m) => {
    if (m === "shutdown") onSignal("ipc:shutdown")
  })
  process.on("uncaughtException", (err) => {
    log.error("uncaught exception", { error: err.message, stack: err.stack })
    void shutdown.trigger("uncaughtException", 1)
  })
  process.on("unhandledRejection", (reason) => {
    log.error("unhandled rejection", { error: reason instanceof Error ? reason.message : String(reason) })
  })
}

function triggerSurveillance(rt: Runtime, source: string): boolean {
  const { accepted, job } = rt.jobs.trigger(source, (signal) =>
    runSurveillance({
      signal,
      retentionDays: rt.cfg.surveillanceRetentionDays,
      beforeInvestigation: async (s) => {
        const free = (await rt.remote?.waitUntilNotBusy(rt.cfg.surveillanceYieldMaxMs, s)) ?? true
        if (!free && !s?.aborted) rt.log.warn("web users still busy after SURVEILLANCE_YIELD_MAX_MS; investigating anyway")
      },
    })
  )
  rt.log.info(accepted ? "surveillance started" : "surveillance already running", { jobId: job.id, source })
  return accepted
}

function startHeartbeat(rt: Runtime, shutdown: ShutdownCoordinator): void {
  rt.heartbeat = setInterval(() => {
    void (async () => {
      const owned = (await rt.lock?.verify()) ?? false
      if (!owned) {
        rt.log.error("single-instance lock lost (database connection dropped?); restarting", { lock: rt.cfg.lockName })
        void shutdown.trigger("lock-lost", 1)
        return
      }
      touchHeartbeat(rt)
      const w = workerStatus()
      rt.log.info("heartbeat", {
        gate: rt.remote?.snapshot().state ?? "idle",
        translation: rt.cfg.runTranslation ? { lastTickAt: w.lastTickAt, lastResult: w.lastResult } : "not-run-here",
        surveillanceJob: rt.jobs.running()?.id ?? null,
        nextSurveillanceAt: rt.scheduler?.nextAt()?.toISOString() ?? null,
        businessHoursUsed: rt.limiter.enabled ? rt.limiter.used(Date.now()) : null,
        rssMb: Math.round(process.memoryUsage().rss / 1_048_576),
      })
    })()
  }, rt.cfg.heartbeatMs)
}

function startServices(rt: Runtime, opts: RunWorkerOptions): void {
  rt.remote = createRemoteGate(process.env, rt.log.child({ component: "ai-gate" }))
  rt.remote.start()
  setWorkerAdmission(() => combineAdmissions(rt.remote?.admit() ?? { allow: true }, rt.limiter.admit(new Date(), workerStatus())))

  if (rt.cfg.runTranslation) {
    startTranslationWorker()
  } else {
    rt.log.warn("translation loop NOT started in the worker", { mode: rt.cfg.translationMode })
  }

  if (rt.cfg.surveillanceTimes.length > 0) {
    rt.scheduler = new DailyScheduler({
      name: "surveillance",
      times: rt.cfg.surveillanceTimes,
      log: rt.log,
      run: async () => {
        if (triggerSurveillance(rt, "schedule")) await rt.jobs.settled()
      },
    })
    rt.scheduler.start()
    rt.log.info("surveillance scheduled", { next: rt.scheduler.nextAt()?.toISOString() })
  }
  if (opts.surveillanceNow) triggerSurveillance(rt, "cli")
  rt.collabScheduler = startCollabScheduler(rt.cfg, rt.log.child({ component: "collab-daily" }), rt.startup.signal)
  rt.trashScheduler = startPurgeTrashScheduler(rt.cfg, rt.log.child({ component: "purge-trash" }), rt.startup.signal)
}

export async function runWorker(cfg: WorkerConfig, opts: RunWorkerOptions): Promise<void> {
  const log = createLogger({ baseName: "worker", bindings: { module: "worker", pid: process.pid } })
  const rt: Runtime = {
    cfg,
    log,
    startup: new AbortController(),
    jobs: new SingleFlightJobRunner<SurveillanceResult>((id, error) => log.error("surveillance job failed", { jobId: id, error })),
    lock: null,
    remote: null,
    scheduler: null,
    collabScheduler: null,
    trashScheduler: null,
    heartbeat: null,
    limiter: new BusinessHoursLimiter(cfg.businessHours),
    startedAt: new Date().toISOString(),
  }
  const shutdown = createShutdown({
    steps: () => shutdownSteps(rt),
    timeoutMs: cfg.shutdownTimeoutMs,
    log,
    exit: (code) => process.exit(code),
  })
  installSignalHandlers(shutdown, log)
  log.info("worker starting", { ...describeConfig(cfg), envFiles: opts.envFiles, node: process.version })

  const connect = createLockConnect(process.env)
  rt.lock = await acquireSingleInstance({
    acquire: (name) => acquireDedicatedLock(connect, name),
    name: cfg.lockName,
    retryMs: STANDBY_RETRY_MS,
    signal: rt.startup.signal,
    log,
  })
  if (!rt.lock) return // shutdown requested while waiting as standby
  startServices(rt, opts)
  startHeartbeat(rt, shutdown)
  touchHeartbeat(rt)
  log.info("worker running")
}
