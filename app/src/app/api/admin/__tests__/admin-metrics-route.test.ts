import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  collect: vi.fn(),
  loadSnapshots: vi.fn(),
  warn: vi.fn(),
}))
vi.mock("@/lib/auth", () => ({ auth: () => m.auth() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: m.warn, error: vi.fn() }) },
}))
vi.mock("@/lib/metrics/runtime", () => ({ collectCurrentMetrics: m.collect }))
vi.mock("@/lib/metrics/snapshots", async (orig) => ({
  ...(await orig<typeof import("@/lib/metrics/snapshots")>()),
  loadSnapshots: m.loadSnapshots,
}))

const route = await import("@/app/api/admin/metrics/route")

beforeEach(() => {
  vi.clearAllMocks()
  m.collect.mockResolvedValue({ takenAt: "t" })
  m.loadSnapshots.mockResolvedValue([{ takenAt: "t0", rpm: 1 }])
})

describe("GET /api/admin/metrics", () => {
  it("401 without a session, 403 for non-admins", async () => {
    m.auth.mockResolvedValue(null)
    expect((await route.GET())!.status).toBe(401)
    m.auth.mockResolvedValue({ user: { id: "u", role: "section_manager" } })
    expect((await route.GET())!.status).toBe(403)
    expect(m.collect).not.toHaveBeenCalled()
  })

  it("returns the live report, 24 h of history and the config", async () => {
    m.auth.mockResolvedValue({ user: { id: "a", role: "admin" } })
    const before = Date.now()
    const res = (await route.GET())!
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      current: { takenAt: "t" },
      history: [{ takenAt: "t0", rpm: 1 }],
      config: { snapshotIntervalMs: 300_000, retentionDays: 14 },
    })
    const since = (m.loadSnapshots.mock.calls[0] as unknown[])[1] as Date
    expect(before - since.getTime()).toBeGreaterThanOrEqual(24 * 3600_000 - 1000)
  })

  it("serves the live numbers when snapshots cannot be read", async () => {
    m.auth.mockResolvedValue({ user: { id: "a", role: "admin" } })
    m.loadSnapshots.mockRejectedValue(new Error("Table MetricSnapshot does not exist"))
    const res = (await route.GET())!
    expect(res.status).toBe(200)
    expect((await res.json()).history).toEqual([])
    expect(m.warn).toHaveBeenCalled()
  })

  it("500 envelope when collecting fails", async () => {
    m.auth.mockResolvedValue({ user: { id: "a", role: "admin" } })
    m.collect.mockRejectedValue(new Error("boom"))
    const res = (await route.GET())!
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe("INTERNAL")
  })
})
