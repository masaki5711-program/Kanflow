import { describe, expect, test, vi } from "vitest"
import { createShutdown } from "../shutdown"

const log = () => ({ info: vi.fn(), error: vi.fn() })

describe("createShutdown", () => {
  test("runs steps strictly in order, then exits with the requested code", async () => {
    const order: string[] = []
    const exit = vi.fn()
    const s = createShutdown({
      timeoutMs: 1_000,
      exit,
      log: log(),
      steps: () => [
        { name: "abort-job", run: () => order.push("abort-job") },
        {
          name: "drain-translation",
          run: async () => {
            await new Promise((r) => setTimeout(r, 5))
            order.push("drain-translation")
          },
        },
        { name: "release-lock", run: async () => order.push("release-lock") },
        { name: "disconnect", run: () => order.push("disconnect") },
      ],
    })
    await s.trigger("SIGTERM", 0)
    expect(order).toEqual(["abort-job", "drain-translation", "release-lock", "disconnect"])
    expect(exit).toHaveBeenCalledWith(0)
  })

  test("a failing step is logged and later steps still run (lock is always released)", async () => {
    const exit = vi.fn()
    const l = log()
    const release = vi.fn()
    const s = createShutdown({
      timeoutMs: 1_000,
      exit,
      log: l,
      steps: () => [
        {
          name: "drain-translation",
          run: () => {
            throw new Error("boom")
          },
        },
        { name: "release-lock", run: release },
      ],
    })
    await s.trigger("SIGINT")
    expect(release).toHaveBeenCalled()
    expect(l.error).toHaveBeenCalledWith("shutdown: drain-translation failed", { error: "boom" })
    expect(exit).toHaveBeenCalledWith(0)
  })

  test("is idempotent: a second trigger does not rerun steps", async () => {
    const step = vi.fn()
    const exit = vi.fn()
    const s = createShutdown({ timeoutMs: 1_000, exit, log: log(), steps: () => [{ name: "x", run: step }] })
    const a = s.trigger("SIGINT")
    const b = s.trigger("SIGTERM")
    expect(s.triggered).toBe(true)
    await Promise.all([a, b])
    expect(step).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  test("forces exit(1) when the sequence exceeds the timeout", async () => {
    vi.useFakeTimers()
    try {
      const exit = vi.fn()
      const s = createShutdown({
        timeoutMs: 100,
        exit,
        log: log(),
        steps: () => [{ name: "hang", run: () => new Promise(() => undefined) }],
      })
      const p = s.trigger("SIGTERM", 0)
      await vi.advanceTimersByTimeAsync(150)
      await p
      expect(exit).toHaveBeenCalledWith(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
