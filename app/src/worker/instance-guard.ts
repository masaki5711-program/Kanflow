import type { NamedLockHandle } from "./named-lock"

/**
 * Single-instance guard: exactly one worker per database holds
 * GET_LOCK('kanflow_worker'). A second instance does not exit (a service
 * manager would just restart it in a loop) — it waits as a hot standby and
 * takes over as soon as the active worker's session ends.
 */

export interface GuardLog {
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
}

export interface SingleInstanceOptions {
  name: string
  retryMs: number
  signal?: AbortSignal
  log?: GuardLog
  /**
   * One non-blocking attempt: the handle, null when another session holds
   * the lock; rejects when the database is unreachable. Production passes
   * acquireDedicatedLock (own mariadb connection, see ./dedicated-lock).
   */
  acquire: (name: string) => Promise<NamedLockHandle | null>
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener("abort", done)
      resolve()
    }
    signal?.addEventListener("abort", done, { once: true })
  })
}

/**
 * Resolve with the lock once acquired, or null if `signal` aborts first.
 * Database errors are logged and retried like "held by another instance".
 */
export async function acquireSingleInstance(opts: SingleInstanceOptions): Promise<NamedLockHandle | null> {
  const sleep = opts.sleep ?? abortableSleep
  let attempts = 0
  while (!opts.signal?.aborted) {
    attempts += 1
    try {
      const handle = await opts.acquire(opts.name)
      if (handle) {
        if (opts.signal?.aborted) {
          await handle.release()
          return null
        }
        opts.log?.info("single-instance lock acquired", { lock: opts.name, attempts })
        return handle
      }
      if (attempts === 1) opts.log?.warn("another worker holds the lock; waiting as standby", { lock: opts.name, retryMs: opts.retryMs })
    } catch (err) {
      opts.log?.warn("single-instance lock attempt failed (database unreachable?)", {
        lock: opts.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    await sleep(opts.retryMs, opts.signal)
  }
  return null
}
