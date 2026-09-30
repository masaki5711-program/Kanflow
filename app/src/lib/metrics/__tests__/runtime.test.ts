import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/ollama/client", () => ({ ollamaQueueStatus: () => ({ max: 1, active: 0, queuedUser: 0, queuedBackground: 0 }) }))
vi.mock("@/lib/translation/priority-gate", () => ({ gate: { status: () => ({ high_active: 0, background_active: 0 }) } }))
vi.mock("@/lib/ai-gate/worker-heartbeat", () => ({
  resolveHeartbeatFile: () => "hb.json",
  readHeartbeatStatus: () => ({ status: "absent", ageSec: null, pid: null }),
}))

const runtime = await import("../runtime")
const { MetricsStore } = await import("../store")

const log = { info: vi.fn(), warn: vi.fn() }

function deps(db: Record<string, unknown>) {
  return {
    ...runtime.defaultCollectDeps(),
    db: {
      $queryRaw: vi.fn(async () => []),
      aiJob: { groupBy: vi.fn(async () => []) },
      fieldTranslation: { groupBy: vi.fn(async () => []) },
      ...db,
    } as never,
    store: new MetricsStore(),
  }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => runtime.stopMetrics())

describe("snapshotTick", () => {
  it("persists then prunes", async () => {
    const create = vi.fn(async () => ({}))
    const deleteMany = vi.fn(async () => ({ count: 0 }))
    expect(await runtime.snapshotTick(log, deps({ metricSnapshot: { create, deleteMany } }), 7)).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    expect(deleteMany).toHaveBeenCalledTimes(1)
  })

  it("logs the first failure of a streak only, then the recovery", async () => {
    const failing = deps({ metricSnapshot: { create: vi.fn(async () => Promise.reject(new Error("no table"))), deleteMany: vi.fn() } })
    expect(await runtime.snapshotTick(log, failing)).toBe(false)
    expect(await runtime.snapshotTick(log, failing)).toBe(false)
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith("metrics snapshot failed", { error: "no table" })
    await runtime.snapshotTick(log, deps({ metricSnapshot: { create: vi.fn(async () => ({})), deleteMany: vi.fn(async () => ({ count: 0 })) } }))
    expect(log.info).toHaveBeenCalledWith("metrics snapshot recovered")
  })
})

describe("startMetrics", () => {
  it("is disabled by METRICS_ENABLED=off", () => {
    expect(runtime.startMetrics(log, { METRICS_ENABLED: "off" })).toBe(false)
  })

  it("starts once per process", () => {
    const spy = vi.spyOn(globalThis, "setInterval")
    expect(runtime.startMetrics(log, {})).toBe(true)
    expect(runtime.startMetrics(log, {})).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][1]).toBe(300_000)
    expect(log.info).toHaveBeenCalledWith("metrics started", { intervalMs: 300_000, retentionDays: 14 })
    spy.mockRestore()
  })
})
