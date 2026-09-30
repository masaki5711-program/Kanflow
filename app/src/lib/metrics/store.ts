/**
 * In-process request metrics (single web process, no dependencies).
 *
 * - Per route template + method: count, 5xx count, 4xx count and a fixed-size
 *   reservoir of the most recent latencies (p50 / p95 / max over it).
 * - Per minute (last 60): count, 5xx, and up to BUCKET_SAMPLES latencies, so
 *   "requests / min", error rate and p95 can be read for a recent window.
 * - AI queue waits (time spent waiting for an Ollama slot) the same way.
 *
 * Memory is bounded: MAX_ROUTES keys (the rest fold into "(other)"),
 * `sampleSize` values per key, 60 minute buckets. State is lost on restart;
 * MetricSnapshot rows (./snapshots.ts) keep the history.
 */

export class RingBuffer {
  private readonly buf: number[] = []
  private next = 0

  constructor(readonly capacity: number) {}

  push(value: number): void {
    if (this.buf.length < this.capacity) {
      this.buf.push(value)
    } else {
      this.buf[this.next] = value
    }
    this.next = (this.next + 1) % this.capacity
  }

  values(): readonly number[] {
    return this.buf
  }

  get size(): number {
    return this.buf.length
  }
}

/** Nearest-rank percentile (p in 0..100) of an unsorted sample; null when empty. Input is not changed. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(Math.max(rank - 1, 0), sorted.length - 1)]
}

export interface RequestSample {
  route: string
  method: string
  status: number
  durationMs: number
  /** Long-lived streamed response (SSE): counted, but excluded from latency. */
  streamed?: boolean
}

export interface RouteSummary {
  route: string
  method: string
  count: number
  /** 5xx responses. */
  errors: number
  /** 4xx responses (auth failures, validation, not found). */
  clientErrors: number
  p50: number | null
  p95: number | null
  maxMs: number
  avgMs: number | null
}

export interface WindowSummary {
  minutes: number
  count: number
  errors: number
  errorRate: number
  perMinute: number
  p50: number | null
  p95: number | null
}

export interface WaitSummary {
  count: number
  p50: number | null
  p95: number | null
  maxMs: number
}

interface RouteStats {
  route: string
  method: string
  count: number
  errors: number
  clientErrors: number
  timed: number
  totalMs: number
  maxMs: number
  samples: RingBuffer
}

interface MinuteBucket {
  start: number
  count: number
  errors: number
  samples: number[]
  aiWaits: number[]
}

export interface MetricsStoreOptions {
  now?: () => number
  /** Latencies kept per route. Default 512. */
  sampleSize?: number
  /** Distinct route keys before folding into "(other)". Default 300. */
  maxRoutes?: number
}

const MINUTE_MS = 60_000
const KEEP_MINUTES = 60
/** Latency samples kept per minute bucket (enough for a stable p95 of one minute). */
const BUCKET_SAMPLES = 500
export const OTHER_ROUTE = "(other)"

export class MetricsStore {
  private readonly now: () => number
  private readonly sampleSize: number
  private readonly maxRoutes: number
  private readonly routeStats = new Map<string, RouteStats>()
  private buckets: MinuteBucket[] = []
  private totalCount = 0
  private totalErrors = 0
  readonly startedAt: number

  constructor(opts: MetricsStoreOptions = {}) {
    this.now = opts.now ?? Date.now
    this.sampleSize = opts.sampleSize ?? 512
    this.maxRoutes = opts.maxRoutes ?? 300
    this.startedAt = this.now()
  }

  recordRequest(sample: RequestSample): void {
    const isError = sample.status >= 500
    const stats = this.statsFor(sample.route, sample.method)
    stats.count += 1
    if (isError) stats.errors += 1
    else if (sample.status >= 400) stats.clientErrors += 1
    this.totalCount += 1
    if (isError) this.totalErrors += 1

    const bucket = this.currentBucket()
    bucket.count += 1
    if (isError) bucket.errors += 1
    if (sample.streamed) return

    const ms = Math.max(0, sample.durationMs)
    stats.timed += 1
    stats.totalMs += ms
    stats.maxMs = Math.max(stats.maxMs, ms)
    stats.samples.push(ms)
    if (bucket.samples.length < BUCKET_SAMPLES) bucket.samples.push(ms)
  }

  /** Time a caller waited for an Ollama slot. */
  recordAiWait(_priority: "user" | "background", waitedMs: number): void {
    const bucket = this.currentBucket()
    if (bucket.aiWaits.length < BUCKET_SAMPLES) bucket.aiWaits.push(Math.max(0, waitedMs))
  }

  routes(): RouteSummary[] {
    return [...this.routeStats.values()].map((s) => {
      const values = s.samples.values()
      return {
        route: s.route,
        method: s.method,
        count: s.count,
        errors: s.errors,
        clientErrors: s.clientErrors,
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        maxMs: s.maxMs,
        avgMs: s.timed > 0 ? Math.round(s.totalMs / s.timed) : null,
      }
    })
  }

  window(minutes: number): WindowSummary {
    const recent = this.bucketsWithin(minutes)
    const count = recent.reduce((n, b) => n + b.count, 0)
    const errors = recent.reduce((n, b) => n + b.errors, 0)
    const samples = recent.flatMap((b) => b.samples)
    return {
      minutes,
      count,
      errors,
      errorRate: count > 0 ? errors / count : 0,
      perMinute: Math.round((count / minutes) * 100) / 100,
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
    }
  }

  aiWait(minutes: number): WaitSummary {
    const waits = this.bucketsWithin(minutes).flatMap((b) => b.aiWaits)
    return {
      count: waits.length,
      p50: percentile(waits, 50),
      p95: percentile(waits, 95),
      maxMs: waits.reduce((m, v) => Math.max(m, v), 0),
    }
  }

  totals(): { count: number; errors: number } {
    return { count: this.totalCount, errors: this.totalErrors }
  }

  uptimeSec(): number {
    return Math.round((this.now() - this.startedAt) / 1000)
  }

  private statsFor(route: string, method: string): RouteStats {
    const key = `${method} ${route}`
    const existing = this.routeStats.get(key)
    if (existing) return existing
    if (this.routeStats.size >= this.maxRoutes && route !== OTHER_ROUTE) return this.statsFor(OTHER_ROUTE, "*")
    const created: RouteStats = {
      route,
      method,
      count: 0,
      errors: 0,
      clientErrors: 0,
      timed: 0,
      totalMs: 0,
      maxMs: 0,
      samples: new RingBuffer(this.sampleSize),
    }
    this.routeStats.set(key, created)
    return created
  }

  private currentBucket(): MinuteBucket {
    const now = this.now()
    const start = now - (now % MINUTE_MS)
    const last = this.buckets[this.buckets.length - 1]
    if (last && last.start === start) return last
    const bucket: MinuteBucket = { start, count: 0, errors: 0, samples: [], aiWaits: [] }
    this.buckets = [...this.buckets.filter((b) => b.start > start - KEEP_MINUTES * MINUTE_MS), bucket]
    return bucket
  }

  private bucketsWithin(minutes: number): MinuteBucket[] {
    const now = this.now()
    const from = now - Math.min(minutes, KEEP_MINUTES) * MINUTE_MS
    return this.buckets.filter((b) => b.start + MINUTE_MS > from)
  }
}

/** Process-wide store (on globalThis so every route bundle and HMR reload share it). */
export function metricsStore(): MetricsStore {
  const g = globalThis as { __kanflowMetricsStore?: MetricsStore }
  g.__kanflowMetricsStore ??= new MetricsStore()
  return g.__kanflowMetricsStore
}
