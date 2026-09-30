import { describe, expect, test, vi } from "vitest"
import { GateBusy, PriorityGate } from "../priority-gate"

describe("PriorityGate", () => {
  test("background ticket is refused while a high call is running", () => {
    const g = new PriorityGate()
    const end = g.beginHigh()
    expect(() => g.beginBackground()).toThrow(GateBusy)
    end()
    const t = g.beginBackground()
    expect(g.background_active).toBe(1)
    t.end()
    expect(g.background_active).toBe(0)
  })

  test("a high entry aborts running background tickets and marks them preempted", () => {
    const g = new PriorityGate()
    const t = g.beginBackground()
    expect(t.preempted).toBe(false)
    const end = g.beginHigh()
    expect(t.signal.aborted).toBe(true)
    expect(t.preempted).toBe(true)
    end()
    t.end()
  })

  test("isIdle honors the quiet window after the last high call", () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-09-10T00:00:00Z"))
      const g = new PriorityGate()
      const end = g.beginHigh()
      expect(g.isIdle(0)).toBe(false)
      end()
      expect(g.isIdle(3000)).toBe(false)
      vi.advanceTimersByTime(3000)
      expect(g.isIdle(3000)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  test("release is idempotent and the counter never goes negative", () => {
    const g = new PriorityGate()
    const end = g.beginHigh()
    end()
    end()
    expect(g.high_active).toBe(0)
  })

  test("withHigh releases on throw", async () => {
    const g = new PriorityGate()
    await expect(g.withHigh(async () => { throw new Error("x") })).rejects.toThrow("x")
    expect(g.high_active).toBe(0)
  })
})

describe("PriorityGate cross-process support", () => {
  test("remote entries block background work but are not counted as local activity", () => {
    const g = new PriorityGate()
    const t = g.beginBackground()
    const release = g.beginHigh({ remote: true })
    expect(t.preempted).toBe(true)
    expect(() => g.beginBackground()).toThrow(GateBusy)
    expect(g.high_active).toBe(1)
    expect(g.local_high_active).toBe(0)
    expect(g.localIdleForMs()).toBe(Number.POSITIVE_INFINITY)
    release()
    release()
    expect(g.high_active).toBe(0)
    t.end()
  })

  test("localIdleForMs tracks only local calls", () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-09-23T00:00:00Z"))
      const g = new PriorityGate()
      const end = g.beginHigh()
      expect(g.localIdleForMs()).toBe(0)
      end()
      vi.setSystemTime(new Date("2026-09-23T00:00:02Z"))
      expect(g.localIdleForMs()).toBe(2_000)
      g.beginHigh({ remote: true })()
      vi.setSystemTime(new Date("2026-09-23T00:00:05Z"))
      expect(g.localIdleForMs()).toBe(5_000)
    } finally {
      vi.useRealTimers()
    }
  })

  test("preemptBackground aborts running tickets without blocking new ones", () => {
    const g = new PriorityGate()
    const t = g.beginBackground()
    expect(g.preemptBackground()).toBe(1)
    expect(t.signal.aborted).toBe(true)
    t.end()
    expect(() => g.beginBackground().end()).not.toThrow()
  })
})
