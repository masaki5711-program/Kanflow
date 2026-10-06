/**
 * After-commit publishing of real-time events (server only).
 *
 * Choice: an AsyncLocalStorage scope opened by `withTransaction`
 * (services/_shared/db.ts) instead of a fixed publish delay. Events published
 * inside the transaction body are buffered in the scope and handed to the
 * bus only once Prisma's `$transaction` has resolved, i.e. after COMMIT — so
 * a client that refetches on the event always reads the committed rows, and
 * a rolled-back write publishes nothing. Callers keep passing `tx` around as
 * before; nothing in the repository signatures changes.
 *
 * Outside a scope (autocommit writes with `defaultDb`, raw
 * `prisma.$transaction` callers, a promise that outlives its transaction)
 * the event is deferred by DEFERRED_PUBLISH_MS and batched, which covers a
 * commit that is still in flight.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { logger } from "@/lib/logger"
import { publishDeferred, publishNow } from "./bus"
import type { RealtimeEvent, RealtimeEventInput } from "./types"

const log = logger.child({ module: "realtime" })

interface CommitScope {
  open: boolean
  events: RealtimeEvent[]
}

const ALS_KEY = Symbol.for("kanflow.realtime.commitScope")

function storage(): AsyncLocalStorage<CommitScope> {
  const g = globalThis as typeof globalThis & { [ALS_KEY]?: AsyncLocalStorage<CommitScope> }
  g[ALS_KEY] ??= new AsyncLocalStorage<CommitScope>()
  return g[ALS_KEY]
}

/**
 * Run `fn` (which performs the transaction) with a commit scope: events
 * published inside are delivered when `fn` resolves, dropped when it rejects.
 * A nested scope (a second `withTransaction` inside the body is a separate
 * transaction) delivers its own events when IT commits.
 */
export async function runWithCommitScope<T>(fn: () => Promise<T>): Promise<T> {
  const scope: CommitScope = { open: true, events: [] }
  try {
    const result = await storage().run(scope, fn)
    scope.open = false
    publishNow(scope.events)
    return result
  } catch (err) {
    scope.open = false
    scope.events = []
    throw err
  }
}

/** Publish once the surrounding transaction (if any) has committed. Never throws. */
export function publishAfterCommit(input: RealtimeEventInput): void {
  try {
    const event: RealtimeEvent = { ...input, at: new Date().toISOString() }
    const scope = storage().getStore()
    if (scope?.open) {
      scope.events = [...scope.events, event]
      return
    }
    publishDeferred(event)
  } catch (err) {
    log.warn("realtime publish failed", { type: input.type, error: err instanceof Error ? err.message : String(err) })
  }
}
