/**
 * In-process pub/sub for real-time update events (server only).
 *
 * Production is ONE `next start` process, so an in-memory bus reaches every
 * open SSE stream; the state lives on `globalThis` so dev HMR re-evaluating
 * this module does not split publishers and subscribers onto two buses.
 * Events written by a separate process (the external translation worker)
 * never arrive here — clients still pick those up by polling / catch-up.
 *
 * Publishers normally go through `publishAfterCommit` (after-commit.ts);
 * this module only delivers: `publishNow` for committed changes and
 * `publishDeferred` for writes made outside `withTransaction`.
 */
import { logger } from "@/lib/logger"
import type { RealtimeEvent } from "./types"

const log = logger.child({ module: "realtime-bus" })

export type RealtimeListener = (event: RealtimeEvent) => void

/** Delay of a publish made outside `withTransaction` (lets an autocommit / raw `$transaction` write land first). */
export const DEFERRED_PUBLISH_MS = 250
/** More events than this for one (type, project, entity type) in one batch collapse into one bulk event. */
export const BULK_COLLAPSE_THRESHOLD = 20

interface BusState {
  listeners: Set<RealtimeListener>
  deferred: RealtimeEvent[]
  timer: ReturnType<typeof setTimeout> | null
}

const BUS_KEY = Symbol.for("kanflow.realtime.bus")

function bus(): BusState {
  const g = globalThis as typeof globalThis & { [BUS_KEY]?: BusState }
  g[BUS_KEY] ??= { listeners: new Set(), deferred: [], timer: null }
  return g[BUS_KEY]
}

/** Receive every published event; returns the unsubscribe function. */
export function subscribe(listener: RealtimeListener): () => void {
  bus().listeners.add(listener)
  return () => {
    bus().listeners.delete(listener)
  }
}

export function listenerCount(): number {
  return bus().listeners.size
}

const recipientsKey = (e: RealtimeEvent) => (e.userIds ? [...e.userIds].sort().join(",") : "*")
const groupKey = (e: RealtimeEvent) => [e.type, e.projectId ?? "", e.entityType ?? "", recipientsKey(e)].join("|")
const eventKey = (e: RealtimeEvent) => [groupKey(e), e.entityId ?? "", e.subjectId ?? "", e.action ?? "", e.actorId ?? ""].join("|")

/**
 * Pure: drop exact duplicates (same change logged twice in one transaction)
 * and collapse a bulk write (reorder of 50 PBIs, ...) into one event without
 * `entityId`, which clients treat as "any entity of this type".
 */
export function coalesce(events: readonly RealtimeEvent[]): RealtimeEvent[] {
  const unique = [...new Map(events.map((e) => [eventKey(e), e])).values()]
  const counts = new Map<string, number>()
  for (const e of unique) counts.set(groupKey(e), (counts.get(groupKey(e)) ?? 0) + 1)
  const out: RealtimeEvent[] = []
  const collapsed = new Set<string>()
  for (const e of unique) {
    const key = groupKey(e)
    if ((counts.get(key) ?? 0) <= BULK_COLLAPSE_THRESHOLD) {
      out.push(e)
    } else if (!collapsed.has(key)) {
      collapsed.add(key)
      out.push({ type: e.type, projectId: e.projectId, userIds: e.userIds, entityType: e.entityType, action: "bulk", actorId: e.actorId, at: e.at })
    }
  }
  return out
}

/** Deliver committed changes to every listener now. A failing listener never affects the others. */
export function publishNow(events: readonly RealtimeEvent[]): void {
  if (events.length === 0) return
  const batch = coalesce(events)
  for (const listener of [...bus().listeners]) {
    for (const event of batch) {
      try {
        listener(event)
      } catch (err) {
        log.warn("realtime listener failed", { type: event.type, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
}

/** Queue for delivery after DEFERRED_PUBLISH_MS; events queued meanwhile go out in the same batch. */
export function publishDeferred(event: RealtimeEvent): void {
  const state = bus()
  state.deferred = [...state.deferred, event]
  if (state.timer) return
  state.timer = setTimeout(() => {
    const batch = state.deferred
    state.deferred = []
    state.timer = null
    publishNow(batch)
  }, DEFERRED_PUBLISH_MS)
  // Never keep a test runner / shutting-down process alive for a notification.
  state.timer.unref?.()
}

/** Tests: drop listeners and pending deferred events. */
export function resetBusForTests(): void {
  const state = bus()
  if (state.timer) clearTimeout(state.timer)
  state.listeners.clear()
  state.deferred = []
  state.timer = null
}
