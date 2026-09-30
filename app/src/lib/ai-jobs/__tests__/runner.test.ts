import { beforeEach, describe, expect, it, vi } from "vitest"
import { AiJobRunner, type AiJobStore, type ClaimedJob } from "../runner"

const JOB: ClaimedJob = { id: "j1", projectId: "p1", userId: "u1", kind: "progress_report", params: { lang: "ja" }, attempts: 1 }
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function store(over: Partial<AiJobStore> = {}): AiJobStore {
  return {
    sweepStale: vi.fn(async () => ({ requeued: 0, failed: 0 })),
    claimNext: vi.fn(async () => JOB),
    setProgress: vi.fn(async () => undefined),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => true),
    requeue: vi.fn(async () => undefined),
    statusOf: vi.fn(async () => "running"),
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe("AiJobRunner.tick", () => {
  it("idle when nothing is queued", async () => {
    const s = store({ claimNext: vi.fn(async () => null) })
    expect(await new AiJobRunner({ store: s, handlers: {}, log }).tick()).toBe("idle")
  })

  it("runs the handler after waiting for the gate, completes and notifies", async () => {
    const order: string[] = []
    const s = store()
    const handler = vi.fn(async (_job: ClaimedJob, ctx: { progress: (n: number) => Promise<void> }) => {
      order.push("handler")
      await ctx.progress(142)
      return { reportId: "r1", title: "Report" }
    })
    const onFinished = vi.fn(async () => undefined)
    const runner = new AiJobRunner({
      store: s,
      handlers: { progress_report: handler },
      waitForTurn: async () => {
        order.push("wait")
      },
      onFinished,
      log,
    })
    expect(await runner.tick()).toBe("ran")
    expect(order).toEqual(["wait", "handler"])
    expect(s.setProgress).toHaveBeenCalledWith("j1", 100)
    expect(s.complete).toHaveBeenCalledWith("j1", "r1")
    expect(onFinished).toHaveBeenCalledWith(JOB, { status: "done", result: { reportId: "r1", title: "Report" } })
    expect(runner.current()).toBeNull()
  })

  it("marks a failing job failed and notifies with the error", async () => {
    const s = store()
    const onFinished = vi.fn(async () => undefined)
    const runner = new AiJobRunner({
      store: s,
      handlers: { progress_report: async () => Promise.reject(new Error("ollama down")) },
      onFinished,
      log,
    })
    await runner.tick()
    expect(s.fail).toHaveBeenCalledWith("j1", "ollama down")
    expect(onFinished).toHaveBeenCalledWith(JOB, { status: "failed", error: "ollama down" })
  })

  it("does not notify when the row was no longer running (cancelled meanwhile)", async () => {
    const s = store({ complete: vi.fn(async () => false) })
    const onFinished = vi.fn(async () => undefined)
    await new AiJobRunner({ store: s, handlers: { progress_report: async () => ({ reportId: "r", title: "t" }) }, onFinished, log }).tick()
    expect(onFinished).not.toHaveBeenCalled()
  })

  it("fails unknown kinds without running anything", async () => {
    const s = store({ claimNext: vi.fn(async () => ({ ...JOB, kind: "mystery" })) })
    await new AiJobRunner({ store: s, handlers: {}, log }).tick()
    expect(s.fail).toHaveBeenCalledWith("j1", "unknown job kind: mystery")
  })

  it("a notification failure never breaks the loop", async () => {
    const runner = new AiJobRunner({
      store: store(),
      handlers: { progress_report: async () => ({ reportId: "r", title: "t" }) },
      onFinished: async () => Promise.reject(new Error("notify down")),
      log,
    })
    expect(await runner.tick()).toBe("ran")
    expect(log.warn).toHaveBeenCalledWith("ai job notification failed", expect.objectContaining({ error: "notify down" }))
  })

  it("sweeps stale running jobs at most once per interval", async () => {
    let now = 1_000_000
    const s = store({ claimNext: vi.fn(async () => null), sweepStale: vi.fn(async () => ({ requeued: 1, failed: 0 })) })
    const runner = new AiJobRunner({ store: s, handlers: {}, log, staleMs: 1000, sweepEveryMs: 60_000, maxAttempts: 2, now: () => now })
    await runner.tick()
    await runner.tick()
    expect(s.sweepStale).toHaveBeenCalledTimes(1)
    expect(s.sweepStale).toHaveBeenCalledWith(new Date(now - 1000), 2)
    now += 60_000
    await runner.tick()
    expect(s.sweepStale).toHaveBeenCalledTimes(2)
    expect(log.warn).toHaveBeenCalledWith("stale ai jobs recovered", { requeued: 1, failed: 0 })
  })
})

describe("cancellation and shutdown", () => {
  /** Handler that runs until its signal aborts. */
  const untilAborted = () =>
    vi.fn(
      (_job: ClaimedJob, ctx: { signal: AbortSignal }) =>
        new Promise<never>((_, reject) => ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason), { once: true })),
    )

  it("a cancel from the UI aborts the running job without failing or notifying", async () => {
    const s = store({ statusOf: vi.fn(async () => "cancelled") })
    const onFinished = vi.fn(async () => undefined)
    const runner = new AiJobRunner({ store: s, handlers: { progress_report: untilAborted() }, onFinished, log, cancelPollMs: 5 })
    await runner.tick()
    expect(s.fail).not.toHaveBeenCalled()
    expect(s.requeue).not.toHaveBeenCalled()
    expect(onFinished).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith("ai job cancelled", { jobId: "j1" })
  })

  it("stop() aborts the current job and returns it to the queue", async () => {
    const s = store()
    const handler = untilAborted()
    const runner = new AiJobRunner({ store: s, handlers: { progress_report: handler }, log, pollMs: 10 })
    runner.start()
    await vi.waitFor(() => expect(runner.current()).toEqual({ id: "j1", kind: "progress_report" }))
    await runner.stop()
    expect(s.requeue).toHaveBeenCalledWith("j1")
    expect(s.fail).not.toHaveBeenCalled()
    expect(runner.current()).toBeNull()
  })

  it("the loop keeps polling after an idle tick and a tick error", async () => {
    let calls = 0
    const s = store({
      claimNext: vi.fn(async () => {
        calls++
        if (calls === 1) throw new Error("db blip")
        return null
      }),
    })
    const runner = new AiJobRunner({ store: s, handlers: {}, log, pollMs: 5 })
    runner.start()
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(3))
    await runner.stop()
    expect(log.error).toHaveBeenCalledWith("ai job tick failed", { error: "db blip" })
  })
})
