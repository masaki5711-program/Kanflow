import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { RealtimeEvent } from "../types"

const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }
vi.mock("@/lib/logger", () => ({ logger: noopLog }))

const bus = await import("../bus")

const ev = (overrides: Partial<RealtimeEvent> = {}): RealtimeEvent => ({
  type: "activity",
  projectId: "p1",
  entityType: "pbi",
  entityId: "b1",
  action: "update",
  at: "2026-10-06T00:00:00.000Z",
  ...overrides,
})

beforeEach(() => bus.resetBusForTests())
afterEach(() => vi.useRealTimers())

describe("subscribe / publishNow", () => {
  it("delivers every published event to every listener until it unsubscribes", () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = bus.subscribe(a)
    bus.subscribe(b)
    bus.publishNow([ev()])
    offA()
    bus.publishNow([ev({ entityId: "b2" })])
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
    expect(bus.listenerCount()).toBe(1)
  })

  it("a throwing listener neither breaks the publisher nor the other listeners", () => {
    const good = vi.fn()
    bus.subscribe(() => {
      throw new Error("boom")
    })
    bus.subscribe(good)
    expect(() => bus.publishNow([ev()])).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    expect(noopLog.warn).toHaveBeenCalled()
  })

  it("does nothing for an empty batch", () => {
    const l = vi.fn()
    bus.subscribe(l)
    bus.publishNow([])
    expect(l).not.toHaveBeenCalled()
  })
})

describe("coalesce", () => {
  it("drops exact duplicates but keeps distinct entities / actions", () => {
    const out = bus.coalesce([ev(), ev(), ev({ entityId: "b2" }), ev({ action: "delete" })])
    expect(out.map((e) => `${e.entityId}:${e.action}`)).toEqual(["b1:update", "b2:update", "b1:delete"])
  })

  it("collapses more than BULK_COLLAPSE_THRESHOLD events of one group into one bulk event without ids", () => {
    const many = Array.from({ length: bus.BULK_COLLAPSE_THRESHOLD + 1 }, (_, i) => ev({ entityId: `b${i}`, action: "move" }))
    const other = ev({ entityType: "sprint", entityId: "s1" })
    const out = bus.coalesce([...many, other])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ type: "activity", projectId: "p1", entityType: "pbi", action: "bulk" })
    expect(out[0].entityId).toBeUndefined()
    expect(out[1]).toBe(other)
  })

  it("keeps notification groups for different recipients apart", () => {
    const out = bus.coalesce([ev({ type: "notification", userIds: ["u1"] }), ev({ type: "notification", userIds: ["u2"] })])
    expect(out).toHaveLength(2)
  })
})

describe("publishDeferred", () => {
  it("batches events queued within DEFERRED_PUBLISH_MS into one delivery after the delay", () => {
    vi.useFakeTimers()
    const l = vi.fn()
    bus.subscribe(l)
    bus.publishDeferred(ev())
    bus.publishDeferred(ev())
    bus.publishDeferred(ev({ entityId: "b2" }))
    vi.advanceTimersByTime(bus.DEFERRED_PUBLISH_MS - 1)
    expect(l).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(l.mock.calls.map(([e]) => e.entityId)).toEqual(["b1", "b2"])
  })

  it("starts a new batch after a delivery", () => {
    vi.useFakeTimers()
    const l = vi.fn()
    bus.subscribe(l)
    bus.publishDeferred(ev())
    vi.advanceTimersByTime(bus.DEFERRED_PUBLISH_MS)
    bus.publishDeferred(ev())
    vi.advanceTimersByTime(bus.DEFERRED_PUBLISH_MS)
    expect(l).toHaveBeenCalledTimes(2)
  })
})
