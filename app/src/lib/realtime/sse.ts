/**
 * Server-Sent Events stream of real-time update events for one browser tab
 * (server only; used by app/api/realtime/route.ts).
 *
 * - `retry: 5000` first, then a `ready` event naming the project actually
 *   subscribed (null when none was asked for or access was refused).
 * - Delivery rule (`shouldDeliver`): an event with `userIds` reaches only
 *   those users; any other event reaches the viewers of its project.
 * - A heartbeat comment every HEARTBEAT_MS keeps idle LAN connections open
 *   and surfaces dead sockets (the failing write closes the stream).
 * - The stream ends after MAX_STREAM_MS; the browser reconnects, which runs
 *   the session check again (revoked / expired sessions stop receiving).
 * - At most MAX_CONNECTIONS_PER_USER open streams per user; more → refused
 *   (the client then falls back to polling and retries later).
 */
import { logger } from "@/lib/logger"
import { subscribe } from "./bus"
import { REALTIME_READY_EVENT, type RealtimeEvent, type RealtimeWireEvent } from "./types"

const log = logger.child({ module: "realtime-sse" })

export const HEARTBEAT_MS = 25_000
export const MAX_STREAM_MS = 15 * 60_000
export const MAX_CONNECTIONS_PER_USER = 8
export const RETRY_MS = 5_000

/** `no-transform` stops Next's compression from buffering the stream. */
export const SSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
}

export interface Subscriber {
  userId: string
  /** Project whose events this stream receives (null = only the user's own events). */
  projectId: string | null
}

/** Pure: does this subscriber receive the event? */
export function shouldDeliver(event: RealtimeEvent, sub: Subscriber): boolean {
  if (event.userIds) return event.userIds.includes(sub.userId)
  return !!event.projectId && event.projectId === sub.projectId
}

/** Pure: the event as sent to the browser (never the other recipients). */
export function toWire(event: RealtimeEvent): RealtimeWireEvent {
  return Object.fromEntries(Object.entries(event).filter(([key]) => key !== "userIds")) as RealtimeWireEvent
}

/** Pure: one SSE frame. */
export function sseFrame(data: unknown, event?: string): string {
  return `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`
}

const REGISTRY_KEY = Symbol.for("kanflow.realtime.connections")

function registry(): Map<string, number> {
  const g = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Map<string, number> }
  g[REGISTRY_KEY] ??= new Map()
  return g[REGISTRY_KEY]
}

function acquire(userId: string): boolean {
  const open = registry().get(userId) ?? 0
  if (open >= MAX_CONNECTIONS_PER_USER) return false
  registry().set(userId, open + 1)
  return true
}

function release(userId: string): void {
  const left = (registry().get(userId) ?? 1) - 1
  if (left > 0) registry().set(userId, left)
  else registry().delete(userId)
}

/** Open streams of a user (tests / diagnostics). */
export function openConnectionCount(userId: string): number {
  return registry().get(userId) ?? 0
}

const encoder = new TextEncoder()

/** Wire the stream to the bus; returns the idempotent close function. */
function start(controller: ReadableStreamDefaultController<Uint8Array>, sub: Subscriber, signal: AbortSignal): () => void {
  let closed = false
  let unsubscribe = () => {}
  // Filled in below; close() may run before them (a failing first write).
  const timers: { heartbeat?: ReturnType<typeof setInterval>; lifetime?: ReturnType<typeof setTimeout> } = {}
  const close = () => {
    if (closed) return
    closed = true
    unsubscribe()
    clearInterval(timers.heartbeat)
    clearTimeout(timers.lifetime)
    signal.removeEventListener("abort", close)
    release(sub.userId)
    log.debug("realtime stream closed", { userId: sub.userId, open: openConnectionCount(sub.userId) })
    try {
      controller.close()
    } catch {
      // Already closed / cancelled by the client.
    }
  }
  const write = (text: string) => {
    if (closed) return
    try {
      controller.enqueue(encoder.encode(text))
    } catch {
      close()
    }
  }
  write(`retry: ${RETRY_MS}\n\n`)
  write(sseFrame({ projectId: sub.projectId }, REALTIME_READY_EVENT))
  unsubscribe = subscribe((event) => {
    if (shouldDeliver(event, sub)) write(sseFrame(toWire(event)))
  })
  timers.heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS)
  timers.lifetime = setTimeout(close, MAX_STREAM_MS)
  if (signal.aborted) close()
  else signal.addEventListener("abort", close)
  return close
}

/**
 * The event stream for one subscriber, or null when the user already has
 * MAX_CONNECTIONS_PER_USER streams open. Closes on `signal` abort (client
 * gone), on reader cancel, on a failed write and after MAX_STREAM_MS.
 */
export function openRealtimeStream(sub: Subscriber, signal: AbortSignal): ReadableStream<Uint8Array> | null {
  if (!acquire(sub.userId)) {
    log.warn("realtime connection limit reached", { userId: sub.userId, limit: MAX_CONNECTIONS_PER_USER })
    return null
  }
  log.debug("realtime stream opened", { userId: sub.userId, projectId: sub.projectId, open: openConnectionCount(sub.userId) })
  let close = () => {}
  return new ReadableStream<Uint8Array>({
    start(controller) {
      close = start(controller, sub, signal)
    },
    cancel() {
      close()
    },
  })
}

/** Tests: forget every open-connection count. */
export function resetConnectionsForTests(): void {
  registry().clear()
}
