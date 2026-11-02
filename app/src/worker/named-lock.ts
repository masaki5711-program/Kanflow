/**
 * Named locks held on a pinned connection: PostgreSQL transaction-level
 * advisory locks (`pg_try_advisory_xact_lock`), the replacement of MySQL's
 * GET_LOCK.
 *
 * The lock is taken inside a long-lived interactive transaction, which pins
 * one pooled connection for as long as the lock is held, and it is released
 * by ending that transaction - never left behind on a pooled connection
 * (a session-level advisory lock would survive the transaction and stay with
 * whichever request reuses the connection). No table is touched. The lock
 * also disappears when the session ends for any reason (process exit, crash,
 * killed connection), so a dead worker can never block its successor.
 *
 * The key is `hashtextextended(name, 0)` (bigint) - the same key space as
 * ./dedicated-lock, so a name held by either kind is refused by the other.
 *
 * `verify()` re-checks ownership on the same connection (also keeps it from
 * idling out); the caller treats `false` as "lost" and shuts down.
 */

export interface RawTx {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
}

export interface TxRunner {
  $transaction<R>(fn: (tx: RawTx) => Promise<R>, options: { maxWait: number; timeout: number }): Promise<R>
}

export interface NamedLockHandle {
  readonly name: string
  /** True while this session still owns the lock. Never throws. */
  verify(): Promise<boolean>
  /** Release the lock and end the pinned transaction (idempotent). */
  release(): Promise<void>
}

export interface AcquireOptions {
  /** Upper bound for holding the lock (transaction timeout). Default ~23 days. */
  holdMs?: number
  /** Max wait for a pooled connection. Default 10 s. */
  maxWaitMs?: number
}

const DEFAULT_HOLD_MS = 2_000_000_000

type Command = { kind: "verify"; done: (owned: boolean) => void } | { kind: "release"; done: () => void }

/** The lock queries answer `v` = true / false (or 1 / 0 / NULL, possibly as bigint). */
export function lockResultIsOne(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false
  const first = rows[0] as Record<string, unknown>
  const v = first?.v
  return v !== null && v !== undefined && Number(v) === 1
}

class Mailbox {
  private queue: Command[] = []
  private waiter: ((c: Command) => void) | null = null

  post(c: Command): void {
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      w(c)
    } else {
      this.queue.push(c)
    }
  }

  next(): Promise<Command> {
    const c = this.queue.shift()
    if (c) return Promise.resolve(c)
    return new Promise((resolve) => {
      this.waiter = resolve
    })
  }
}

async function serve(tx: RawTx, name: string, box: Mailbox): Promise<void> {
  for (;;) {
    const cmd = await box.next()
    if (cmd.kind === "release") {
      // Ending the transaction (returning from the callback) releases the xact lock.
      cmd.done()
      return
    }
    try {
      cmd.done(lockResultIsOne(await tx.$queryRaw`
        SELECT EXISTS (
          SELECT 1 FROM pg_locks
          WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid() AND objsubid = 1
            AND classid = ((hashtextextended(${name}, 0) >> 32) & 4294967295)::oid
            AND objid = (hashtextextended(${name}, 0) & 4294967295)::oid
        ) AS v`))
    } catch {
      cmd.done(false)
      return
    }
  }
}

/**
 * Try to take `name` without waiting (`pg_try_advisory_xact_lock`).
 * Resolves with a handle when acquired, null when another session holds it.
 * Rejects only when the database is unreachable.
 */
export function acquireNamedLock(client: TxRunner, name: string, opts: AcquireOptions = {}): Promise<NamedLockHandle | null> {
  const box = new Mailbox()
  let ended = false
  let txDone: Promise<void> = Promise.resolve()
  const handle: NamedLockHandle = {
    name,
    verify: () => {
      if (ended) return Promise.resolve(false)
      return new Promise<boolean>((done) => {
        box.post({ kind: "verify", done })
        void txDone.then(() => done(false))
      })
    },
    release: async () => {
      if (!ended) box.post({ kind: "release", done: () => undefined })
      await txDone
    },
  }
  return new Promise((resolve, reject) => {
    let settled = false
    txDone = client
      .$transaction(
        async (tx) => {
          const got = lockResultIsOne(await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${name}, 0)) AS v`)
          settled = true
          if (!got) {
            resolve(null)
            return
          }
          resolve(handle)
          await serve(tx, name, box)
        },
        { maxWait: opts.maxWaitMs ?? 10_000, timeout: opts.holdMs ?? DEFAULT_HOLD_MS }
      )
      .catch((err: unknown) => {
        if (!settled) reject(err)
      })
      .finally(() => {
        ended = true
      })
  })
}
