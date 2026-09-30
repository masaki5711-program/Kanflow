import type { Language } from "@/lib/i18n"

/** Wire shape of GET /api/admin/metrics (lib/metrics/collect.ts + snapshots.ts). */
export interface MetricsWindow {
  minutes: number
  count: number
  errors: number
  errorRate: number
  perMinute: number
  p50: number | null
  p95: number | null
}

export interface MetricsRoute {
  route: string
  method: string
  count: number
  errors: number
  clientErrors: number
  p50: number | null
  p95: number | null
  maxMs: number
  avgMs: number | null
}

export interface MetricsCurrent {
  takenAt: string
  process: { pid: number; uptimeSec: number; rssMb: number; heapUsedMb: number }
  http: { last5m: MetricsWindow; last60m: MetricsWindow; totals: { count: number; errors: number }; routes: MetricsRoute[] }
  ai: {
    gate: { highActive: number; backgroundActive: number }
    ollama: { max: number; active: number; queuedUser: number; queuedBackground: number } | null
    wait5m: { count: number; p50: number | null; p95: number | null; maxMs: number }
    jobs: { queued: number; running: number; oldestQueuedAgeSec: number | null } | null
  }
  translation: { pending: number; running: number; failed: number; oldestPendingAgeSec: number | null } | null
  worker: { status: "ok" | "stale" | "absent"; heartbeatAgeSec: number | null }
  db: { ok: boolean; latencyMs: number | null }
}

export interface MetricsPoint {
  takenAt: string
  pid: number
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
  translationPending: number | null
  translationOldestSec: number | null
  workerAgeSec: number | null
  dbLatencyMs: number | null
}

export interface MetricsResponse {
  current: MetricsCurrent
  history: MetricsPoint[]
  config: { snapshotIntervalMs: number; retentionDays: number }
}

/** "850 ms" / "1.2 s"; null → dash. */
export function formatMs(ms: number | null, dash = "—"): string {
  if (ms === null || !Number.isFinite(ms)) return dash
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
}

/** Compact duration: "45s", "12m", "5h 12m", "3d 4h". */
export function formatDuration(sec: number | null, dash = "—"): string {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return dash
  const s = Math.floor(sec)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.01 ? 2 : 1)}%`
}

const LOCALE: Record<Language, string> = { ja: "ja-JP", en: "en-US", id: "id-ID" }

export function formatClock(iso: string, language: Language): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(LOCALE[language] ?? LOCALE.ja, { hour: "2-digit", minute: "2-digit" })
}

/** Pure: chart rows (time label + series) from snapshot points. */
export function chartRows(points: readonly MetricsPoint[], language: Language) {
  return points.map((p) => ({
    time: formatClock(p.takenAt, language),
    rpm: p.rpm,
    p95: p.p95,
    aiQueued: p.aiQueued,
    aiActive: p.aiActive,
    aiWaitP95: p.aiWaitP95,
    aiJobsQueued: p.aiJobsQueued,
    translationPending: p.translationPending,
  }))
}

export type ChartRow = ReturnType<typeof chartRows>[number]
