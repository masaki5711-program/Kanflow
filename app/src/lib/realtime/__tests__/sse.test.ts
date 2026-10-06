import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { RealtimeEvent } from "../types"

const noopLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => noopLog }
vi.mock("@/lib/logger", () => ({ logger: noopLog }))

const bus = await import("../bus")
const sse = await import("../sse")

const ev = (overrides: Partial<RealtimeEvent> = {}): RealtimeEvent => ({ type: "activity", projectId: "p1", entityType: "pbi", entityId: "b1", at: "t", ...overrides })

/** Reads whatever the stream has produced so far. */
async function drain(reader: ReadableStreamDefaultReader<Uint8Array>, chunks: number): Promise<string> {
  const decoder = new TextDecoder()
  let text = ""
  for (let i = 0; i < chunks; i++) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value)
  }
  return text
}

beforeEach(() => {
  bus.resetBusForTests()
  sse.resetConnectionsForTests()
})
afterEach(() => vi.useRealTimers())

describe("shouldDeliver / toWire / sseFrame", () => {
  const me = { userId: "u1", projectId: "p1" }

  it("project events reach the subscribers of that project only", () => {
    expect(sse.shouldDeliver(ev(), me)).toBe(true)
    expect(sse.shouldDeliver(ev({ projectId: "p2" }), me)).toBe(false)
    expect(sse.shouldDeliver(ev(), { userId: "u1", projectId: null })).toBe(false)
    expect(sse.shouldDeliver(ev({ projectId: undefined }), me)).toBe(false)
  })

  it("events with recipients reach only them, whatever project is subscribed", () => {
    expect(sse.shouldDeliver(ev({ type: "notification", userIds: ["u1"], projectId: "p9" }), { userId: "u1", projectId: null })).toBe(true)
    expect(sse.shouldDeliver(ev({ type: "notification", userIds: ["u2"] }), me)).toBe(false)
  })

  it("never sends the recipient list to the browser", () => {
    const wire = sse.toWire(ev({ userIds: ["u1", "u2"] }))
    expect(wire).not.toHaveProperty("userIds")
    expect(wire).toMatchObject({ type: "activity", entityId: "b1" })
  })

  it("formats named and unnamed frames", () => {
    expect(sse.sseFrame({ a: 1 })).toBe('data: {"a":1}\n\n')
    expect(sse.sseFrame({ a: 1 }, "ready")).toBe('event: ready\ndata: {"a":1}\n\n')
  })

  it("headers disable caching / transformation (no compression buffering)", () => {
    expect(sse.SSE_HEADERS["Content-Type"]).toContain("text/event-stream")
    expect(sse.SSE_HEADERS["Cache-Control"]).toContain("no-transform")
  })
})

describe("openRealtimeStream", () => {
  it("starts with retry + ready, then streams the subscriber's events only", async () => {
    const controller = new AbortController()
    const stream = sse.openRealtimeStream({ userId: "u1", projectId: "p1" }, controller.signal)
    const reader = stream!.getReader()
    const head = await drain(reader, 2)
    expect(head).toBe(`retry: ${sse.RETRY_MS}\n\nevent: ready\ndata: {"projectId":"p1"}\n\n`)

    bus.publishNow([ev({ projectId: "p2", entityId: "other" }), ev({ entityId: "mine" }), ev({ type: "notification", userIds: ["u1"], entityId: "bell" })])
    const body = await drain(reader, 2)
    expect(body).toContain('"entityId":"mine"')
    expect(body).toContain('"entityId":"bell"')
    expect(body).not.toContain("other")
    expect(body).not.toContain("userIds")
    controller.abort()
  })

  it("sends a heartbeat comment every HEARTBEAT_MS", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const reader = sse.openRealtimeStream({ userId: "u1", projectId: null }, controller.signal)!.getReader()
    await drain(reader, 2)
    vi.advanceTimersByTime(sse.HEARTBEAT_MS)
    expect(await drain(reader, 1)).toBe(": ping\n\n")
    controller.abort()
  })

  it("cleans up on abort: unsubscribed, connection released, stream closed", async () => {
    const controller = new AbortController()
    const reader = sse.openRealtimeStream({ userId: "u1", projectId: "p1" }, controller.signal)!.getReader()
    await drain(reader, 2)
    expect(bus.listenerCount()).toBe(1)
    expect(sse.openConnectionCount("u1")).toBe(1)
    controller.abort()
    expect(bus.listenerCount()).toBe(0)
    expect(sse.openConnectionCount("u1")).toBe(0)
    expect((await reader.read()).done).toBe(true)
  })

  it("cleans up when the reader cancels", async () => {
    const reader = sse.openRealtimeStream({ userId: "u1", projectId: "p1" }, new AbortController().signal)!.getReader()
    await drain(reader, 2)
    await reader.cancel()
    expect(bus.listenerCount()).toBe(0)
    expect(sse.openConnectionCount("u1")).toBe(0)
  })

  it("closes itself after MAX_STREAM_MS (the reconnect re-checks the session)", async () => {
    vi.useFakeTimers()
    const reader = sse.openRealtimeStream({ userId: "u1", projectId: "p1" }, new AbortController().signal)!.getReader()
    await drain(reader, 2)
    vi.advanceTimersByTime(sse.MAX_STREAM_MS)
    expect(bus.listenerCount()).toBe(0)
    // Heartbeats queued until then are still readable; the stream then ends.
    const rest = await drain(reader, 1000)
    expect(rest.replaceAll(": ping\n\n", "")).toBe("")
    expect((await reader.read()).done).toBe(true)
  })

  it("an already aborted request never stays subscribed", () => {
    const controller = new AbortController()
    controller.abort()
    sse.openRealtimeStream({ userId: "u1", projectId: "p1" }, controller.signal)
    expect(bus.listenerCount()).toBe(0)
    expect(sse.openConnectionCount("u1")).toBe(0)
  })

  it("refuses more than MAX_CONNECTIONS_PER_USER streams per user (others unaffected); a closed one frees a slot", () => {
    const controllers = Array.from({ length: sse.MAX_CONNECTIONS_PER_USER }, () => new AbortController())
    for (const c of controllers) expect(sse.openRealtimeStream({ userId: "u1", projectId: null }, c.signal)).not.toBeNull()
    expect(sse.openRealtimeStream({ userId: "u1", projectId: null }, new AbortController().signal)).toBeNull()
    expect(sse.openRealtimeStream({ userId: "u2", projectId: null }, new AbortController().signal)).not.toBeNull()
    controllers[0].abort()
    expect(sse.openRealtimeStream({ userId: "u1", projectId: null }, new AbortController().signal)).not.toBeNull()
  })
})
