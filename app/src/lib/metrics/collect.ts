/**
 * One metrics report of this web process: request stats from the in-process
 * store plus live probes (AI gate / Ollama queue, AI job queue, translation
 * backlog, worker heartbeat, DB ping). Dependencies are injected so the
 * probes can be tested without Prisma / Ollama; runtime.ts wires the real ones.
 *
 * Every probe is best effort: a failing or missing source (e.g. the AiJob
 * table before its migration) yields null for that section, never an error.
 */
import type { Db } from "@/services/_shared/db"
import type { MetricsStore, RouteSummary, WaitSummary, WindowSummary } from "./store"

export interface QueueStatus {
  max: number
  active: number
  queuedUser: number
  queuedBackground: number
}

export interface AiJobQueue {
  queued: number
  running: number
  oldestQueuedAgeSec: number | null
}

export interface TranslationBacklog {
  pending: number
  running: number
  failed: number
  oldestPendingAgeSec: number | null
}

export interface MetricsReport {
  takenAt: string
  process: { pid: number; uptimeSec: number; rssMb: number; heapUsedMb: number }
  http: {
    last5m: WindowSummary
    last60m: WindowSummary
    totals: { count: number; errors: number }
    /** Slowest first (p95), at most TOP_ROUTES. */
    routes: RouteSummary[]
  }
  ai: {
    gate: { highActive: number; backgroundActive: number }
    ollama: QueueStatus | null
    wait5m: WaitSummary
    jobs: AiJobQueue | null
  }
  translation: TranslationBacklog | null
  worker: { status: "ok" | "stale" | "absent"; heartbeatAgeSec: number | null }
  db: { ok: boolean; latencyMs: number | null }
}

export interface CollectDeps {
  db: Db
  store: MetricsStore
  now: () => number
  gateStatus: () => { high_active: number; background_active: number }
  ollamaStatus: () => QueueStatus
  heartbeat: (nowMs: number) => { status: "ok" | "stale" | "absent"; ageSec: number | null }
  processInfo?: () => { pid: number; uptimeSec: number; rssBytes: number; heapUsedBytes: number }
  timeoutMs?: number
}

export const TOP_ROUTES = 50
const DEFAULT_TIMEOUT_MS = 3000
const MB = 1024 * 1024

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const ageSec = (from: Date | null | undefined, nowMs: number): number | null =>
  from ? Math.max(0, Math.round((nowMs - from.getTime()) / 1000)) : null

async function pingDb(deps: CollectDeps, timeoutMs: number): Promise<MetricsReport["db"]> {
  const t0 = performance.now()
  try {
    await withTimeout(deps.db.$queryRaw`SELECT 1`, timeoutMs)
    return { ok: true, latencyMs: Math.round((performance.now() - t0) * 10) / 10 }
  } catch {
    return { ok: false, latencyMs: null }
  }
}

async function aiJobQueue(deps: CollectDeps, nowMs: number, timeoutMs: number): Promise<AiJobQueue | null> {
  try {
    const rows = await withTimeout(
      deps.db.aiJob.groupBy({
        by: ["status"],
        where: { status: { in: ["queued", "running"] } },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      timeoutMs
    )
    const queued = rows.find((r) => r.status === "queued")
    const running = rows.find((r) => r.status === "running")
    return {
      queued: queued?._count._all ?? 0,
      running: running?._count._all ?? 0,
      oldestQueuedAgeSec: ageSec(queued?._min.createdAt, nowMs),
    }
  } catch {
    return null
  }
}

async function translationBacklog(deps: CollectDeps, nowMs: number, timeoutMs: number): Promise<TranslationBacklog | null> {
  try {
    const rows = await withTimeout(
      deps.db.fieldTranslation.groupBy({
        by: ["status"],
        where: { status: { in: ["pending", "running", "failed"] } },
        _count: { _all: true },
        _min: { requestedAt: true },
      }),
      timeoutMs
    )
    const of = (status: string) => rows.find((r) => r.status === status)
    return {
      pending: of("pending")?._count._all ?? 0,
      running: of("running")?._count._all ?? 0,
      failed: of("failed")?._count._all ?? 0,
      oldestPendingAgeSec: ageSec(of("pending")?._min.requestedAt, nowMs),
    }
  } catch {
    return null
  }
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

function defaultProcessInfo() {
  const mem = process.memoryUsage()
  return { pid: process.pid, uptimeSec: Math.round(process.uptime()), rssBytes: mem.rss, heapUsedBytes: mem.heapUsed }
}

/** Pure: routes sorted slowest first (p95, then count), capped. */
export function slowestRoutes(routes: readonly RouteSummary[], limit = TOP_ROUTES): RouteSummary[] {
  return [...routes].sort((a, b) => (b.p95 ?? -1) - (a.p95 ?? -1) || b.count - a.count).slice(0, limit)
}

export async function collectMetrics(deps: CollectDeps): Promise<MetricsReport> {
  const nowMs = deps.now()
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const [db, jobs, translation] = await Promise.all([
    pingDb(deps, timeoutMs),
    aiJobQueue(deps, nowMs, timeoutMs),
    translationBacklog(deps, nowMs, timeoutMs),
  ])
  const proc = (deps.processInfo ?? defaultProcessInfo)()
  const gate = safe(deps.gateStatus) ?? { high_active: 0, background_active: 0 }
  const hb = safe(() => deps.heartbeat(nowMs)) ?? { status: "absent" as const, ageSec: null }
  return {
    takenAt: new Date(nowMs).toISOString(),
    process: {
      pid: proc.pid,
      uptimeSec: proc.uptimeSec,
      rssMb: Math.round(proc.rssBytes / MB),
      heapUsedMb: Math.round(proc.heapUsedBytes / MB),
    },
    http: {
      last5m: deps.store.window(5),
      last60m: deps.store.window(60),
      totals: deps.store.totals(),
      routes: slowestRoutes(deps.store.routes()),
    },
    ai: {
      gate: { highActive: gate.high_active, backgroundActive: gate.background_active },
      ollama: safe(deps.ollamaStatus),
      wait5m: deps.store.aiWait(5),
      jobs,
    },
    translation,
    worker: { status: hb.status, heartbeatAgeSec: hb.ageSec },
    db,
  }
}
