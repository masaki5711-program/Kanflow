/**
 * Wiring of the metrics module into the web process (started from
 * instrumentation.ts, Node runtime only):
 *
 * - installs the diagnostics_channel HTTP hook (per-route request metrics)
 * - every METRICS_SNAPSHOT_INTERVAL_MS (default 5 min) collects a report,
 *   stores it as a MetricSnapshot row and prunes rows older than
 *   METRICS_RETENTION_DAYS (default 14)
 *
 * METRICS_ENABLED=off disables both. Idempotent per process.
 */
import { readHeartbeatStatus, resolveHeartbeatFile } from "@/lib/ai-gate/worker-heartbeat"
import { ollamaQueueStatus } from "@/lib/ollama/client"
import { gate } from "@/lib/translation/priority-gate"
import { parseWorkerMode } from "@/lib/translation/worker-mode"
import { defaultDb } from "@/services/_shared/db"
import { collectMetrics, type CollectDeps, type MetricsReport } from "./collect"
import { installHttpMetrics } from "./http-hook"
import { metricsEnabled, metricsRetentionDays, persistSnapshot, pruneSnapshots, snapshotIntervalMs } from "./snapshots"
import { metricsStore } from "./store"

interface RuntimeLog {
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
}

export function defaultCollectDeps(): CollectDeps {
  return {
    db: defaultDb,
    store: metricsStore(),
    now: Date.now,
    gateStatus: () => gate.status(),
    ollamaStatus: ollamaQueueStatus,
    workerExpected: () => parseWorkerMode(process.env.AI_TRANSLATION_WORKER) === "external",
    heartbeat: (nowMs) => {
      const hb = readHeartbeatStatus(resolveHeartbeatFile(process.env), nowMs, process.env)
      return { status: hb.status, ageSec: hb.ageSec }
    },
  }
}

export function collectCurrentMetrics(): Promise<MetricsReport> {
  return collectMetrics(defaultCollectDeps())
}

interface RuntimeState {
  timer: ReturnType<typeof setInterval> | null
  uninstall: (() => void) | null
  lastTickFailed: boolean
}

function state(): RuntimeState {
  const g = globalThis as { __kanflowMetricsRuntime?: RuntimeState }
  g.__kanflowMetricsRuntime ??= { timer: null, uninstall: null, lastTickFailed: false }
  return g.__kanflowMetricsRuntime
}

/** One snapshot tick: collect → persist → prune. Never throws; logs the first failure of a streak only. */
export async function snapshotTick(log: RuntimeLog, deps: CollectDeps = defaultCollectDeps(), retentionDays = metricsRetentionDays()): Promise<boolean> {
  const s = state()
  try {
    const report = await collectMetrics(deps)
    await persistSnapshot(deps.db, report)
    await pruneSnapshots(deps.db, retentionDays, new Date(deps.now()))
    if (s.lastTickFailed) log.info("metrics snapshot recovered")
    s.lastTickFailed = false
    return true
  } catch (err) {
    if (!s.lastTickFailed) log.warn("metrics snapshot failed", { error: err instanceof Error ? err.message : String(err) })
    s.lastTickFailed = true
    return false
  }
}

/** Start request metrics + the snapshot timer. Returns false when disabled. */
export function startMetrics(log: RuntimeLog, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (!metricsEnabled(env)) {
    log.info("metrics disabled (METRICS_ENABLED=off)")
    return false
  }
  const s = state()
  if (s.timer) return true
  s.uninstall = installHttpMetrics()
  const intervalMs = snapshotIntervalMs(env)
  s.timer = setInterval(() => void snapshotTick(log), intervalMs)
  s.timer.unref?.()
  log.info("metrics started", { intervalMs, retentionDays: metricsRetentionDays(env) })
  return true
}

/** Stop the timer and the HTTP hook (tests / graceful shutdown). */
export function stopMetrics(): void {
  const s = state()
  if (s.timer) clearInterval(s.timer)
  s.uninstall?.()
  s.timer = null
  s.uninstall = null
  s.lastTickFailed = false
}
