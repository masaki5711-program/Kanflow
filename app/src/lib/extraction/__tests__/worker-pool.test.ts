import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createWorkerPool, type PoolOutcome, type WorkerLike } from "../worker-pool"

class FakeWorker extends EventEmitter implements WorkerLike {
  terminated = 0
  terminate() {
    this.terminated += 1
    return Promise.resolve(1)
  }
}

function parse(msg: unknown): PoolOutcome<string> {
  const m = msg as { ok: boolean; text?: string; error?: string }
  return m.ok ? { ok: true, value: m.text ?? "" } : { ok: false, error: m.error ?? "?" }
}

function makePool(overrides: { maxConcurrent?: number; maxQueue?: number; timeoutMs?: number } = {}) {
  const workers: FakeWorker[] = []
  const spawn = vi.fn((job: string) => {
    void job
    const w = new FakeWorker()
    workers.push(w)
    return w
  })
  const pool = createWorkerPool<string, string>({
    maxConcurrent: overrides.maxConcurrent ?? 2,
    maxQueue: overrides.maxQueue ?? 10,
    timeoutMs: overrides.timeoutMs ?? 1000,
    spawn,
    parseMessage: parse,
  })
  return { pool, spawn, workers }
}

describe("createWorkerPool", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("resolves with the parsed worker message and terminates the worker", async () => {
    const { pool, workers } = makePool()
    const p = pool.run("a")
    workers[0].emit("message", { ok: true, text: "hello" })
    await expect(p).resolves.toEqual({ ok: true, value: "hello" })
    expect(workers[0].terminated).toBe(1)
    expect(pool.stats()).toEqual({ active: 0, queued: 0 })
  })

  it("runs at most maxConcurrent workers and queues the rest in FIFO order", async () => {
    const { pool, spawn, workers } = makePool({ maxConcurrent: 2 })
    const p1 = pool.run("1")
    const p2 = pool.run("2")
    const p3 = pool.run("3")
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(pool.stats()).toEqual({ active: 2, queued: 1 })

    workers[0].emit("message", { ok: true, text: "one" })
    await expect(p1).resolves.toEqual({ ok: true, value: "one" })
    expect(spawn).toHaveBeenCalledTimes(3)
    expect(spawn.mock.calls[2][0]).toBe("3")
    expect(pool.stats()).toEqual({ active: 2, queued: 0 })

    workers[1].emit("message", { ok: true, text: "two" })
    workers[2].emit("message", { ok: true, text: "three" })
    await expect(p2).resolves.toEqual({ ok: true, value: "two" })
    await expect(p3).resolves.toEqual({ ok: true, value: "three" })
    expect(pool.stats()).toEqual({ active: 0, queued: 0 })
  })

  it("terminates the worker and frees the slot on timeout", async () => {
    const { pool, spawn, workers } = makePool({ maxConcurrent: 1, timeoutMs: 60_000 })
    const p1 = pool.run("slow")
    const p2 = pool.run("next")
    expect(spawn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    await expect(p1).resolves.toEqual({ ok: false, error: "timed out after 60s" })
    expect(workers[0].terminated).toBe(1)

    // queued job starts once the timed-out worker is released
    expect(spawn).toHaveBeenCalledTimes(2)
    workers[1].emit("message", { ok: true, text: "done" })
    await expect(p2).resolves.toEqual({ ok: true, value: "done" })
  })

  it("ignores late messages after a timeout", async () => {
    const { pool, workers } = makePool({ timeoutMs: 10 })
    const p = pool.run("x")
    vi.advanceTimersByTime(10)
    workers[0].emit("message", { ok: true, text: "late" })
    await expect(p).resolves.toEqual({ ok: false, error: "timed out after 0s" })
    expect(pool.stats().active).toBe(0)
  })

  it("maps worker error and unexpected exit to failures", async () => {
    const { pool, workers } = makePool()
    const p1 = pool.run("err")
    const p2 = pool.run("exit")
    workers[0].emit("error", new Error("boom"))
    workers[1].emit("exit", 3)
    await expect(p1).resolves.toEqual({ ok: false, error: "boom" })
    await expect(p2).resolves.toEqual({ ok: false, error: "worker exited unexpectedly (code 3)" })
    expect(pool.stats()).toEqual({ active: 0, queued: 0 })
  })

  it("reports a spawn failure without leaking the slot", async () => {
    const pool = createWorkerPool<string, string>({
      maxConcurrent: 1,
      maxQueue: 1,
      timeoutMs: 1000,
      spawn: () => {
        throw new Error("no such file")
      },
      parseMessage: parse,
    })
    await expect(pool.run("a")).resolves.toEqual({ ok: false, error: "failed to start worker: no such file" })
    expect(pool.stats()).toEqual({ active: 0, queued: 0 })
  })

  it("rejects new jobs immediately when the queue is full", async () => {
    const { pool } = makePool({ maxConcurrent: 1, maxQueue: 1 })
    void pool.run("running")
    void pool.run("queued")
    await expect(pool.run("overflow")).resolves.toEqual({
      ok: false,
      error: "extraction queue is full, try again later",
    })
  })
})
