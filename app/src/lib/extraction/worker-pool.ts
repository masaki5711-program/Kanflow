/**
 * Minimal bounded worker pool for CPU-heavy, one-shot jobs.
 *
 * - At most `maxConcurrent` workers run at once; further jobs wait in a FIFO
 *   queue (bounded by `maxQueue` — beyond that callers get an immediate error
 *   instead of piling up unbounded memory/latency).
 * - Each job gets a hard wall-clock timeout; on expiry the worker is
 *   terminated so a pathological file cannot pin a CPU core forever.
 * - The worker spawn is injected so the scheduling logic is unit-testable
 *   without real processes.
 */

export type PoolOutcome<T> = { ok: true; value: T } | { ok: false; error: string }

/** Minimal worker handle (a forked ChildProcess adapted in runner.ts, or a fake in tests). */
export interface WorkerLike {
  on(event: "message", listener: (msg: unknown) => void): unknown
  on(event: "error", listener: (err: Error) => void): unknown
  on(event: "exit", listener: (code: number | null) => void): unknown
  terminate(): void
}

export interface WorkerPoolOptions<J, T> {
  maxConcurrent: number
  maxQueue: number
  timeoutMs: number
  spawn: (job: J) => WorkerLike
  /** Converts the single worker message into an outcome (validate untrusted shape here). */
  parseMessage: (msg: unknown) => PoolOutcome<T>
}

export interface WorkerPool<J, T> {
  run(job: J): Promise<PoolOutcome<T>>
  stats(): { active: number; queued: number }
}

export function createWorkerPool<J, T>(opts: WorkerPoolOptions<J, T>): WorkerPool<J, T> {
  let active = 0
  const queue: Array<() => void> = []

  const release = () => {
    active -= 1
    const next = queue.shift()
    if (next) next()
  }

  const execute = (job: J): Promise<PoolOutcome<T>> =>
    new Promise((resolve) => {
      let settled = false
      let worker: WorkerLike | null = null
      const timer = setTimeout(() => {
        finish({ ok: false, error: `timed out after ${Math.round(opts.timeoutMs / 1000)}s` })
      }, opts.timeoutMs)

      function finish(outcome: PoolOutcome<T>) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (worker) {
          // Idempotent; the outcome is already decided, so a kill failure is irrelevant.
          try {
            worker.terminate()
          } catch {
            /* already exited */
          }
        }
        release()
        resolve(outcome)
      }

      try {
        worker = opts.spawn(job)
      } catch (err) {
        finish({ ok: false, error: `failed to start worker: ${errorMessage(err)}` })
        return
      }
      worker.on("message", (msg) => finish(opts.parseMessage(msg)))
      worker.on("error", (err) => finish({ ok: false, error: errorMessage(err) }))
      worker.on("exit", (code) => finish({ ok: false, error: `worker exited unexpectedly (code ${code})` }))
    })

  return {
    run(job) {
      if (active < opts.maxConcurrent) {
        active += 1
        return execute(job)
      }
      if (queue.length >= opts.maxQueue) {
        return Promise.resolve({ ok: false, error: "extraction queue is full, try again later" })
      }
      return new Promise((resolve) => {
        queue.push(() => {
          active += 1
          execute(job).then(resolve)
        })
      })
    },
    stats: () => ({ active, queued: queue.length }),
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
