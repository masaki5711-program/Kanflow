import { describe, expect, it, vi } from "vitest"
import { collectMetrics, slowestRoutes, type CollectDeps } from "../collect"
import {
  DEFAULT_RETENTION_DAYS,
  loadSnapshots,
  metricsEnabled,
  metricsRetentionDays,
  persistSnapshot,
  pruneSnapshots,
  snapshotIntervalMs,
  toSnapshotPoint,
} from "../snapshots"
import { MetricsStore } from "../store"

const NOW = Date.parse("2026-10-05T12:00:00Z")

function fakeDb(over: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn(async () => [{ 1: 1 }]),
    aiJob: {
      groupBy: vi.fn(async () => [
        { status: "queued", _count: { _all: 2 }, _min: { createdAt: new Date(NOW - 90_000) } },
        { status: "running", _count: { _all: 1 }, _min: { createdAt: new Date(NOW - 10_000) } },
      ]),
    },
    fieldTranslation: {
      groupBy: vi.fn(async () => [
        { status: "pending", _count: { _all: 7 }, _min: { requestedAt: new Date(NOW - 600_000) } },
        { status: "failed", _count: { _all: 1 }, _min: { requestedAt: new Date(NOW - 1) } },
      ]),
    },
    metricSnapshot: { create: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 3 })), findMany: vi.fn() },
    ...over,
  }
}

function deps(db = fakeDb(), store = new MetricsStore({ now: () => NOW })): CollectDeps {
  return {
    db: db as never,
    store,
    now: () => NOW,
    gateStatus: () => ({ high_active: 1, background_active: 0 }),
    ollamaStatus: () => ({ max: 1, active: 1, queuedUser: 2, queuedBackground: 1 }),
    heartbeat: () => ({ status: "ok", ageSec: 12 }),
    processInfo: () => ({ pid: 42, uptimeSec: 3600, rssBytes: 200 * 1024 * 1024, heapUsedBytes: 80 * 1024 * 1024 }),
  }
}

describe("collectMetrics", () => {
  it("combines the store with the live probes", async () => {
    const store = new MetricsStore({ now: () => NOW })
    store.recordRequest({ route: "/api/a", method: "GET", status: 200, durationMs: 30 })
    store.recordAiWait("user", 1500)
    const r = await collectMetrics(deps(fakeDb(), store))
    expect(r.takenAt).toBe(new Date(NOW).toISOString())
    expect(r.process).toEqual({ pid: 42, uptimeSec: 3600, rssMb: 200, heapUsedMb: 80 })
    expect(r.http.last5m.count).toBe(1)
    expect(r.http.routes[0]).toMatchObject({ route: "/api/a", p95: 30 })
    expect(r.ai).toMatchObject({
      gate: { highActive: 1, backgroundActive: 0 },
      ollama: { queuedUser: 2 },
      wait5m: { p95: 1500 },
      jobs: { queued: 2, running: 1, oldestQueuedAgeSec: 90 },
    })
    expect(r.translation).toEqual({ pending: 7, running: 0, failed: 1, oldestPendingAgeSec: 600 })
    expect(r.worker).toEqual({ status: "ok", heartbeatAgeSec: 12 })
    expect(r.db.ok).toBe(true)
    expect(typeof r.db.latencyMs).toBe("number")
  })

  it("tolerates missing tables and failing probes", async () => {
    const boom = vi.fn(async () => {
      throw Object.assign(new Error("table does not exist"), { code: "P2021" })
    })
    const d = deps(fakeDb({ $queryRaw: boom, aiJob: { groupBy: boom }, fieldTranslation: { groupBy: boom } }))
    const r = await collectMetrics({
      ...d,
      ollamaStatus: () => {
        throw new Error("x")
      },
      heartbeat: () => {
        throw new Error("fs")
      },
    })
    expect(r.ai.jobs).toBeNull()
    expect(r.ai.ollama).toBeNull()
    expect(r.translation).toBeNull()
    expect(r.db).toEqual({ ok: false, latencyMs: null })
    expect(r.worker).toEqual({ status: "absent", heartbeatAgeSec: null })
  })

  it("times out a hanging DB probe", async () => {
    const hang = vi.fn(() => new Promise(() => undefined))
    const r = await collectMetrics({ ...deps(fakeDb({ $queryRaw: hang })), timeoutMs: 5 })
    expect(r.db.ok).toBe(false)
  })

  it("slowestRoutes sorts by p95 then count and caps", () => {
    const base = { method: "GET", errors: 0, clientErrors: 0, p50: null, maxMs: 0, avgMs: null }
    const routes = [
      { ...base, route: "/a", count: 1, p95: 10 },
      { ...base, route: "/b", count: 9, p95: null },
      { ...base, route: "/c", count: 2, p95: 300 },
      { ...base, route: "/d", count: 5, p95: 10 },
    ]
    expect(slowestRoutes(routes, 3).map((r) => r.route)).toEqual(["/c", "/d", "/a"])
  })
})

describe("snapshots", () => {
  it("env settings with defaults", () => {
    expect(metricsEnabled({})).toBe(true)
    expect(metricsEnabled({ METRICS_ENABLED: "off" })).toBe(false)
    expect(metricsRetentionDays({})).toBe(DEFAULT_RETENTION_DAYS)
    expect(metricsRetentionDays({ METRICS_RETENTION_DAYS: "3" })).toBe(3)
    expect(snapshotIntervalMs({})).toBe(300_000)
    expect(snapshotIntervalMs({ METRICS_SNAPSHOT_INTERVAL_MS: "5" })).toBe(300_000)
    expect(snapshotIntervalMs({ METRICS_SNAPSHOT_INTERVAL_MS: "120000" })).toBe(120_000)
  })

  it("persists a compact point and prunes by retention", async () => {
    const db = fakeDb()
    const report = await collectMetrics(deps(db))
    await persistSnapshot(db as never, report)
    const arg = (db.metricSnapshot.create.mock.calls[0] as unknown as [{ data: { takenAt: Date; data: string } }])[0]
    expect(arg.data.takenAt).toEqual(new Date(NOW))
    expect(JSON.parse(arg.data.data)).toEqual(toSnapshotPoint(report))
    expect(toSnapshotPoint(report)).toMatchObject({ pid: 42, aiQueued: 3, aiJobsQueued: 2, translationPending: 7, workerAgeSec: 12 })

    expect(await pruneSnapshots(db as never, 14, new Date(NOW))).toBe(3)
    expect(db.metricSnapshot.deleteMany).toHaveBeenCalledWith({ where: { takenAt: { lt: new Date(NOW - 14 * 86_400_000) } } })
  })

  it("loads the newest points oldest-first and skips malformed rows", async () => {
    const findMany = vi.fn(async () => [
      { data: JSON.stringify({ takenAt: "2026-10-05T11:55:00Z", rpm: 2 }) },
      { data: "not json" },
      { data: JSON.stringify({ nope: true }) },
      { data: JSON.stringify({ takenAt: "2026-10-05T11:50:00Z", rpm: 1 }) },
    ])
    const since = new Date(NOW - 86_400_000)
    const points = await loadSnapshots(fakeDb({ metricSnapshot: { findMany } }) as never, since)
    expect(points.map((p) => p.rpm)).toEqual([1, 2])
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { takenAt: { gte: since } }, orderBy: { takenAt: "desc" } }))
  })
})
