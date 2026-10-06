import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRealtimeConnection, FALLBACK_AFTER_FAILURES, HIDDEN_CLOSE_MS, RECONNECT_DELAYS_MS, streamUrl } from "../realtime-connection"
import { createRealtimeHub, parseWireEvent, projectIdFromPath, type RealtimeHub, type RealtimeSignal } from "../realtime-hub"

/** Minimal EventSource double driven by the test. */
class FakeSource {
  static all: FakeSource[] = []
  readyState = 0
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly url: string) {
    FakeSource.all.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  message(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) })
  }
  /** Network drop: the browser keeps retrying (CONNECTING). */
  drop() {
    this.readyState = 0
    this.onerror?.()
  }
  /** HTTP error (401 / 429 / 500): EventSource gives up (CLOSED). */
  refuse() {
    this.readyState = 2
    this.onerror?.()
  }
  close() {
    this.closed = true
    this.readyState = 2
  }
}

function fakeDoc() {
  const listeners = new Set<() => void>()
  return {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    set(state: DocumentVisibilityState) {
      this.visibilityState = state
      for (const l of [...listeners]) l()
    },
  }
}

let hub: RealtimeHub
let signals: RealtimeSignal[]
let doc: ReturnType<typeof fakeDoc>
const latest = () => FakeSource.all.at(-1) as FakeSource

function connect(projectId: string | null = "p1") {
  const conn = createRealtimeConnection(hub, { createSource: (url) => new FakeSource(url) as unknown as EventSource, doc: doc as never })
  conn.start(projectId)
  return conn
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeSource.all = []
  hub = createRealtimeHub()
  signals = []
  hub.subscribe((s) => signals.push(s))
  doc = fakeDoc()
})
afterEach(() => vi.useRealTimers())

describe("createRealtimeConnection", () => {
  it("opens one stream for the project; the first open is not a catch-up", () => {
    connect("p 1")
    expect(FakeSource.all).toHaveLength(1)
    expect(latest().url).toBe("/api/realtime?projectId=p%201")
    expect(hub.getStatus()).toBe("connecting")
    latest().open()
    expect(hub.getStatus()).toBe("open")
    expect(signals).toEqual([])
  })

  it("forwards well-formed events and ignores malformed ones", () => {
    connect()
    latest().open()
    latest().message({ type: "comment", projectId: "p1", entityId: "b1", at: "t" })
    latest().message("not json")
    latest().message({ type: "unknown" })
    expect(signals).toEqual([{ type: "comment", projectId: "p1", entityId: "b1", at: "t" }])
  })

  it("after a dropped connection the browser's reconnect triggers one resync", () => {
    connect()
    latest().open()
    latest().drop()
    expect(hub.getStatus()).toBe("connecting")
    latest().open()
    expect(signals).toEqual([{ type: "resync" }])
  })

  it("reads 'fallback' after repeated failures while the browser keeps retrying", () => {
    connect()
    for (let i = 0; i < FALLBACK_AFTER_FAILURES; i++) latest().drop()
    expect(hub.getStatus()).toBe("fallback")
    latest().open()
    expect(hub.getStatus()).toBe("open")
  })

  it("a refused stream (CLOSED) falls back and reconnects itself with backoff, then catches up", () => {
    connect()
    latest().refuse()
    expect(hub.getStatus()).toBe("fallback")
    expect(FakeSource.all).toHaveLength(1)
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0])
    expect(FakeSource.all).toHaveLength(2)
    latest().refuse()
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0])
    expect(FakeSource.all).toHaveLength(2)
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[1] - RECONNECT_DELAYS_MS[0])
    expect(FakeSource.all).toHaveLength(3)
    latest().open()
    expect(signals).toEqual([{ type: "resync" }])
  })

  it("a route change re-subscribes for the new project without a resync", () => {
    const conn = connect("p1")
    latest().open()
    conn.setProject("p2")
    expect(FakeSource.all[0].closed).toBe(true)
    expect(latest().url).toBe(streamUrl("p2"))
    latest().open()
    conn.setProject("p2")
    expect(FakeSource.all).toHaveLength(2)
    expect(signals).toEqual([])
  })

  it("events while hidden are held back and end in one resync when visible again", () => {
    connect()
    latest().open()
    doc.set("hidden")
    latest().message({ type: "activity", projectId: "p1", at: "t" })
    expect(signals).toEqual([])
    doc.set("visible")
    expect(signals).toEqual([{ type: "resync" }])
  })

  it("a tab hidden for HIDDEN_CLOSE_MS closes the stream and reconnects + catches up when visible", () => {
    connect()
    latest().open()
    doc.set("hidden")
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS)
    expect(FakeSource.all[0].closed).toBe(true)
    doc.set("visible")
    expect(FakeSource.all).toHaveLength(2)
    latest().open()
    expect(signals).toEqual([{ type: "resync" }])
  })

  it("a short hide keeps the stream open", () => {
    connect()
    latest().open()
    doc.set("hidden")
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS - 1)
    doc.set("visible")
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS)
    expect(FakeSource.all).toHaveLength(1)
    expect(FakeSource.all[0].closed).toBe(false)
  })

  it("stop closes everything and ignores late callbacks of the old stream", () => {
    const conn = connect()
    const first = latest()
    first.open()
    conn.stop()
    expect(first.closed).toBe(true)
    expect(hub.getStatus()).toBe("idle")
    first.message({ type: "activity", projectId: "p1", at: "t" })
    first.refuse()
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS.at(-1) as number)
    expect(signals).toEqual([])
    expect(FakeSource.all).toHaveLength(1)
  })

  it("without EventSource the status is 'unsupported' (polling stays)", () => {
    const conn = createRealtimeConnection(hub, { createSource: null, doc: doc as never })
    conn.start(null)
    expect(hub.getStatus()).toBe("unsupported")
  })
})

describe("realtime-hub helpers", () => {
  it("parseWireEvent keeps known string fields only", () => {
    expect(parseWireEvent(JSON.stringify({ type: "git", projectId: "p1", entityId: 5, extra: "x" }))).toEqual({ type: "git", projectId: "p1", at: "" })
    expect(parseWireEvent("null")).toBeNull()
    expect(parseWireEvent(JSON.stringify({ projectId: "p1" }))).toBeNull()
  })

  it("projectIdFromPath reads /projects/<id>/... only", () => {
    expect(projectIdFromPath("/projects/abc/sprints")).toBe("abc")
    expect(projectIdFromPath("/projects/a%20b")).toBe("a b")
    expect(projectIdFromPath("/projects/%E0%A4%A")).toBeNull()
    expect(projectIdFromPath("/")).toBeNull()
    expect(projectIdFromPath(null)).toBeNull()
  })

  it("a throwing listener does not stop the others; status listeners fire on change only", () => {
    const h = createRealtimeHub()
    const ok = vi.fn()
    h.subscribe(() => {
      throw new Error("x")
    })
    h.subscribe(ok)
    h.emit({ type: "resync" })
    expect(ok).toHaveBeenCalledTimes(1)
    const status = vi.fn()
    const off = h.subscribeStatus(status)
    h.setStatus("open")
    h.setStatus("open")
    off()
    h.setStatus("fallback")
    expect(status).toHaveBeenCalledTimes(1)
  })
})
