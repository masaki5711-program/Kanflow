import { afterEach, describe, expect, it, vi } from "vitest"
import { anySignal, startDeadline } from "@/lib/ollama/signals"

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("anySignal", () => {
  it("returns the single defined signal as-is", () => {
    const c = new AbortController()
    expect(anySignal([undefined, c.signal])).toBe(c.signal)
  })

  it("aborts when any input aborts (native AbortSignal.any)", () => {
    const a = new AbortController()
    const b = new AbortController()
    const s = anySignal([a.signal, b.signal])
    expect(s.aborted).toBe(false)
    b.abort("why")
    expect(s.aborted).toBe(true)
    expect(s.reason).toBe("why")
  })

  describe("fallback without AbortSignal.any", () => {
    function withoutAny() {
      const orig = AbortSignal.any
      Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true, writable: true })
      return () => Object.defineProperty(AbortSignal, "any", { value: orig, configurable: true, writable: true })
    }

    it("propagates a later abort", () => {
      const restore = withoutAny()
      try {
        const a = new AbortController()
        const b = new AbortController()
        const s = anySignal([a.signal, b.signal])
        a.abort("first")
        expect(s.aborted).toBe(true)
        expect(s.reason).toBe("first")
      } finally {
        restore()
      }
    })

    it("is already aborted when an input already is", () => {
      const restore = withoutAny()
      try {
        const a = new AbortController()
        a.abort("pre")
        const s = anySignal([a.signal, new AbortController().signal])
        expect(s.aborted).toBe(true)
        expect(s.reason).toBe("pre")
      } finally {
        restore()
      }
    })
  })
})

describe("startDeadline", () => {
  it("aborts with the built reason after ms", () => {
    vi.useFakeTimers()
    const d = startDeadline(100, () => new Error("late"))
    vi.advanceTimersByTime(99)
    expect(d.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(d.signal.aborted).toBe(true)
    expect((d.signal.reason as Error).message).toBe("late")
  })

  it("never aborts once cleared", () => {
    vi.useFakeTimers()
    const d = startDeadline(100, () => "x")
    d.clear()
    d.clear()
    vi.advanceTimersByTime(1000)
    expect(d.signal.aborted).toBe(false)
  })
})
