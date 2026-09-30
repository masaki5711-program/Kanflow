/**
 * MetricSnapshot persistence: a compact point per 5-minute tick so the admin
 * charts survive restarts. Retention: METRICS_RETENTION_DAYS (default 14).
 */
import type { Db } from "@/services/_shared/db"
import type { MetricsReport } from "./collect"

export interface SnapshotPoint {
  takenAt: string
  pid: number
  /** Requests per minute over the last 5 minutes. */
  rpm: number
  requests: number
  errors: number
  errorRate: number
  p50: number | null
  p95: number | null
  aiActive: number | null
  aiQueued: number | null
  aiWaitP95: number | null
  aiJobsQueued: number | null
  aiJobsRunning: number | null
  aiJobsOldestSec: number | null
  translationPending: number | null
  translationOldestSec: number | null
  workerStatus: string
  workerAgeSec: number | null
  dbLatencyMs: number | null
  heapUsedMb: number
}

export const DEFAULT_RETENTION_DAYS = 14
export const DEFAULT_SNAPSHOT_INTERVAL_MS = 5 * 60_000
/** Min interval accepted from env (protects the DB from a typo like "5"). */
const MIN_SNAPSHOT_INTERVAL_MS = 60_000
const DAY_MS = 86_400_000
/** Upper bound of points returned for a chart (24 h at 5 min = 288 per process). */
export const MAX_POINTS = 2000

export function metricsEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const v = env.METRICS_ENABLED?.trim().toLowerCase()
  return !(v === "0" || v === "false" || v === "off" || v === "no")
}

export function metricsRetentionDays(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const n = Number(env.METRICS_RETENTION_DAYS)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS
}

export function snapshotIntervalMs(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const n = Number(env.METRICS_SNAPSHOT_INTERVAL_MS)
  return Number.isInteger(n) && n >= MIN_SNAPSHOT_INTERVAL_MS ? n : DEFAULT_SNAPSHOT_INTERVAL_MS
}

/** Pure: report → compact chart point. */
export function toSnapshotPoint(r: MetricsReport): SnapshotPoint {
  const ollama = r.ai.ollama
  return {
    takenAt: r.takenAt,
    pid: r.process.pid,
    rpm: r.http.last5m.perMinute,
    requests: r.http.last5m.count,
    errors: r.http.last5m.errors,
    errorRate: r.http.last5m.errorRate,
    p50: r.http.last5m.p50,
    p95: r.http.last5m.p95,
    aiActive: ollama ? ollama.active : null,
    aiQueued: ollama ? ollama.queuedUser + ollama.queuedBackground : null,
    aiWaitP95: r.ai.wait5m.p95,
    aiJobsQueued: r.ai.jobs?.queued ?? null,
    aiJobsRunning: r.ai.jobs?.running ?? null,
    aiJobsOldestSec: r.ai.jobs?.oldestQueuedAgeSec ?? null,
    translationPending: r.translation?.pending ?? null,
    translationOldestSec: r.translation?.oldestPendingAgeSec ?? null,
    workerStatus: r.worker.status,
    workerAgeSec: r.worker.heartbeatAgeSec,
    dbLatencyMs: r.db.latencyMs,
    heapUsedMb: r.process.heapUsedMb,
  }
}

export async function persistSnapshot(db: Db, report: MetricsReport): Promise<void> {
  await db.metricSnapshot.create({
    data: { takenAt: new Date(report.takenAt), data: JSON.stringify(toSnapshotPoint(report)) },
  })
}

export async function pruneSnapshots(db: Db, retentionDays: number, now: Date = new Date()): Promise<number> {
  const { count } = await db.metricSnapshot.deleteMany({ where: { takenAt: { lt: new Date(now.getTime() - retentionDays * DAY_MS) } } })
  return count
}

function parsePoint(text: string): SnapshotPoint | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== "object") return null
    const p = parsed as Partial<SnapshotPoint>
    return typeof p.takenAt === "string" && typeof p.rpm === "number" ? (p as SnapshotPoint) : null
  } catch {
    return null
  }
}

/** Points since `since`, oldest first; malformed rows are skipped. */
export async function loadSnapshots(db: Db, since: Date): Promise<SnapshotPoint[]> {
  const rows = await db.metricSnapshot.findMany({
    where: { takenAt: { gte: since } },
    select: { data: true },
    // Newest MAX_POINTS (desc + take), returned oldest first for the charts.
    orderBy: { takenAt: "desc" },
    take: MAX_POINTS,
  })
  return rows
    .map((r) => parsePoint(r.data))
    .filter((p): p is SnapshotPoint => p !== null)
    .reverse()
}
