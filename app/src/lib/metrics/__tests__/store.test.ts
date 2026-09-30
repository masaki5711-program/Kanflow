import { describe, expect, it } from "vitest"
import { MetricsStore, RingBuffer, percentile } from "../store"
import { routeTemplate } from "../route-template"

describe("percentile", () => {
  it("nearest-rank over an unsorted sample", () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6]
    expect(percentile(values, 50)).toBe(5)
    expect(percentile(values, 95)).toBe(10)
    expect(percentile(values, 0)).toBe(1)
    expect(percentile([42], 95)).toBe(42)
  })

  it("null for an empty sample, does not reorder the input", () => {
    expect(percentile([], 50)).toBeNull()
    const input = [3, 1, 2]
    percentile(input, 50)
    expect(input).toEqual([3, 1, 2])
  })
})

describe("RingBuffer", () => {
  it("keeps only the newest `capacity` values", () => {
    const r = new RingBuffer(3)
    for (const v of [1, 2, 3, 4, 5]) r.push(v)
    expect([...r.values()].sort()).toEqual([3, 4, 5])
    expect(r.size).toBe(3)
  })
})

describe("routeTemplate", () => {
  it.each([
    ["/api/projects/cmg1abc2def3ghi4jkl5mno6/backlog", "/api/projects/:id/backlog"],
    ["/api/projects/cmg1abc2def3ghi4jkl5mno6/sprints/cmg9zzz2def3ghi4jkl5mno6/tasks?x=1", "/api/projects/:id/sprints/:id/tasks"],
    ["/api/v1/projects/p1/backlog", "/api/v1/projects/p1/backlog"],
    ["/api/notifications/123", "/api/notifications/:id"],
    ["/api/files/550e8400-e29b-41d4-a716-446655440000", "/api/files/:id"],
    ["/api/admin/trash/projects", "/api/admin/trash/projects"],
    ["/api/wopi/files/abcDEF123456789xyz_-/contents", "/api/wopi/files/:id/contents"],
  ])("%s → %s", (path, template) => {
    expect(routeTemplate(path)).toBe(template)
  })

  it("returns null outside /api", () => {
    expect(routeTemplate("/projects/abc")).toBeNull()
    expect(routeTemplate("/_next/static/x.js")).toBeNull()
  })
})

describe("MetricsStore", () => {
  function storeAt(start = 0) {
    let now = start
    const store = new MetricsStore({ now: () => now, sampleSize: 100, maxRoutes: 3 })
    return { store, advance: (ms: number) => (now += ms), at: () => now }
  }

  it("aggregates count, errors and latency percentiles per route + method", () => {
    const { store } = storeAt()
    for (let i = 1; i <= 100; i++) store.recordRequest({ route: "/api/a", method: "GET", status: i === 100 ? 500 : 200, durationMs: i })
    store.recordRequest({ route: "/api/a", method: "POST", status: 404, durationMs: 1 })
    const [a] = store.routes().filter((r) => r.method === "GET")
    expect(a).toMatchObject({ route: "/api/a", method: "GET", count: 100, errors: 1, p50: 50, p95: 95, maxMs: 100 })
    const post = store.routes().find((r) => r.method === "POST")
    expect(post).toMatchObject({ count: 1, errors: 0, clientErrors: 1 })
  })

  it("windowed stats: requests / minute, error rate and p95 over the last N minutes", () => {
    const { store, advance } = storeAt(Date.parse("2026-10-05T00:00:00Z"))
    store.recordRequest({ route: "/api/old", method: "GET", status: 500, durationMs: 1000 })
    advance(10 * 60_000)
    for (let i = 0; i < 10; i++) store.recordRequest({ route: "/api/a", method: "GET", status: i < 1 ? 503 : 200, durationMs: 10 * (i + 1) })
    const w = store.window(5)
    expect(w.count).toBe(10)
    expect(w.errors).toBe(1)
    expect(w.errorRate).toBeCloseTo(0.1)
    expect(w.perMinute).toBe(2)
    expect(w.p95).toBe(100)
    expect(store.window(60).count).toBe(11)
  })

  it("streamed responses count but do not skew latency", () => {
    const { store } = storeAt()
    store.recordRequest({ route: "/api/chat", method: "POST", status: 200, durationMs: 90_000, streamed: true })
    store.recordRequest({ route: "/api/chat", method: "POST", status: 200, durationMs: 20 })
    const [r] = store.routes()
    expect(r.count).toBe(2)
    expect(r.p95).toBe(20)
    expect(store.window(5).p95).toBe(20)
  })

  it("caps distinct routes, folding the rest into an overflow bucket", () => {
    const { store } = storeAt()
    for (const r of ["/api/1", "/api/2", "/api/3", "/api/4", "/api/5"]) store.recordRequest({ route: r, method: "GET", status: 200, durationMs: 1 })
    const routes = store.routes()
    expect(routes).toHaveLength(4)
    expect(routes.find((r) => r.route === "(other)")?.count).toBe(2)
  })

  it("AI queue wait samples", () => {
    const { store } = storeAt()
    for (const ms of [0, 0, 100, 2000]) store.recordAiWait("user", ms)
    store.recordAiWait("background", 50)
    expect(store.aiWait(5)).toMatchObject({ count: 5, p50: 50, p95: 2000, maxMs: 2000 })
  })

  it("drops minute buckets older than an hour", () => {
    const { store, advance } = storeAt(0)
    store.recordRequest({ route: "/api/a", method: "GET", status: 200, durationMs: 1 })
    advance(61 * 60_000)
    store.recordRequest({ route: "/api/a", method: "GET", status: 200, durationMs: 1 })
    expect(store.window(24 * 60).count).toBe(1)
    expect(store.totals()).toEqual({ count: 2, errors: 0 })
  })

  it("uptime from the store start", () => {
    const { store, advance } = storeAt(1000)
    advance(5000)
    expect(store.uptimeSec()).toBe(5)
  })
})
