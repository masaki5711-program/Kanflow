import { describe, expect, test, vi } from "vitest"
import { SingleFlightJobRunner } from "../jobs/job-runner"

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("SingleFlightJobRunner (surveillance trigger mutex)", () => {
  test("trigger returns immediately and a concurrent trigger does not start a second run", async () => {
    const runner = new SingleFlightJobRunner<string>()
    const d = deferred<string>()
    const run = vi.fn(() => d.promise)

    const first = runner.trigger("http", run)
    const second = runner.trigger("http", run)

    expect(first.accepted).toBe(true)
    expect(first.job.status).toBe("running")
    expect(second.accepted).toBe(false)
    expect(second.job.id).toBe(first.job.id)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)

    d.resolve("ok")
    await runner.settled()
    expect(runner.get(first.job.id)).toMatchObject({ status: "done", result: "ok" })
    expect(runner.running()).toBeNull()

    // After completion a new trigger is accepted again.
    const third = runner.trigger("schedule", async () => "again")
    expect(third.accepted).toBe(true)
    await runner.settled()
  })

  test("failures are recorded and reported, not thrown", async () => {
    const onError = vi.fn()
    const runner = new SingleFlightJobRunner<string>(onError)
    const { job } = runner.trigger("http", async () => {
      throw new Error("db down")
    })
    await runner.settled()
    expect(runner.get(job.id)).toMatchObject({ status: "failed", error: "db down" })
    expect(onError).toHaveBeenCalledWith(job.id, "db down")
  })

  test("abort() signals the running job and marks it aborted", async () => {
    const runner = new SingleFlightJobRunner<string>()
    const { job } = runner.trigger(
      "schedule",
      (signal) =>
        new Promise<string>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
        })
    )
    await Promise.resolve()
    runner.abort()
    await runner.settled()
    expect(runner.get(job.id)?.status).toBe("aborted")
  })

  test("keeps a bounded history", async () => {
    const runner = new SingleFlightJobRunner<number>()
    for (let i = 0; i < 12; i++) {
      runner.trigger("t", async () => i)
      await runner.settled()
    }
    expect(runner.list()).toHaveLength(10)
  })
})
