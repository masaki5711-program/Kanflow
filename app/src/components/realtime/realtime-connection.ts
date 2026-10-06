import { REALTIME_URL } from "@/lib/realtime/types"
import { parseWireEvent, type RealtimeHub } from "./realtime-hub"

/** A tab hidden this long closes its stream (reconnects + catches up when visible again). */
export const HIDDEN_CLOSE_MS = 5 * 60_000
/** Consecutive errors after which the status reads "fallback" while the browser keeps retrying. */
export const FALLBACK_AFTER_FAILURES = 3
/** Own reconnect delays after the server refused the stream (401 / 429 / 5xx closes EventSource for good). */
export const RECONNECT_DELAYS_MS: readonly number[] = [5_000, 10_000, 30_000, 60_000, 120_000, 300_000]

/** `EventSource.CLOSED` (the global may be missing where a factory is injected). */
const READY_STATE_CLOSED = 2

type SourceFactory = (url: string) => EventSource

export interface RealtimeConnectionOptions {
  /** Injectable for tests; default `new EventSource(url)` (null when the browser has none). */
  createSource?: SourceFactory | null
  doc?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">
}

export interface RealtimeConnection {
  start(projectId: string | null): void
  /** Re-subscribe for another project (route change). */
  setProject(projectId: string | null): void
  stop(): void
}

export function streamUrl(projectId: string | null): string {
  return projectId ? `${REALTIME_URL}?projectId=${encodeURIComponent(projectId)}` : REALTIME_URL
}

function defaultFactory(): SourceFactory | null {
  return typeof EventSource === "undefined" ? null : (url) => new EventSource(url)
}

/**
 * One EventSource per tab, feeding `hub`. Catch-up rule: after any error,
 * refused connection or hidden-tab close, the next successful open emits
 * `{ type: "resync" }`; events arriving while the tab is hidden are not
 * dispatched but also end in one resync when it becomes visible.
 */
export function createRealtimeConnection(hub: RealtimeHub, options: RealtimeConnectionOptions = {}): RealtimeConnection {
  const factory = options.createSource === undefined ? defaultFactory() : options.createSource
  const doc = options.doc ?? (typeof document === "undefined" ? undefined : document)
  let source: EventSource | null = null
  let projectId: string | null = null
  let active = false
  let needsResync = false
  let missedWhileHidden = false
  let failures = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined
  const isHidden = () => doc?.visibilityState === "hidden"

  function close() {
    clearTimeout(retryTimer)
    retryTimer = undefined
    source?.close()
    source = null
  }

  function scheduleReconnect() {
    const delay = RECONNECT_DELAYS_MS[Math.min(failures - 1, RECONNECT_DELAYS_MS.length - 1)]
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      open()
    }, delay)
  }

  function onError(es: EventSource) {
    if (es !== source) return
    needsResync = true
    failures += 1
    if (es.readyState === READY_STATE_CLOSED) {
      source = null
      hub.setStatus("fallback")
      scheduleReconnect()
      return
    }
    hub.setStatus(failures >= FALLBACK_AFTER_FAILURES ? "fallback" : "connecting")
  }

  function onOpen(es: EventSource) {
    if (es !== source) return
    failures = 0
    hub.setStatus("open")
    if (!needsResync) return
    needsResync = false
    hub.emit({ type: "resync" })
  }

  function onMessage(es: EventSource, data: string) {
    if (es !== source) return
    const event = parseWireEvent(data)
    if (!event) return
    if (isHidden()) missedWhileHidden = true
    else hub.emit(event)
  }

  function open() {
    if (!active || source) return
    if (!factory) {
      hub.setStatus("unsupported")
      return
    }
    const es = factory(streamUrl(projectId))
    source = es
    if (hub.getStatus() !== "fallback") hub.setStatus("connecting")
    es.onopen = () => onOpen(es)
    es.onmessage = (ev: MessageEvent<string>) => onMessage(es, ev.data)
    es.onerror = () => onError(es)
  }

  function onVisibility() {
    if (isHidden()) {
      clearTimeout(hiddenTimer)
      hiddenTimer = setTimeout(() => {
        close()
        needsResync = true
      }, HIDDEN_CLOSE_MS)
      return
    }
    clearTimeout(hiddenTimer)
    if (!source && !retryTimer) open()
    else if (missedWhileHidden && hub.getStatus() === "open") hub.emit({ type: "resync" })
    missedWhileHidden = false
  }

  return {
    start(id) {
      if (active) return
      active = true
      projectId = id
      doc?.addEventListener("visibilitychange", onVisibility)
      open()
    },
    setProject(id) {
      if (id === projectId) return
      projectId = id
      if (!active) return
      // A route change: the new page loads fresh data itself, no resync needed.
      close()
      open()
    },
    stop() {
      active = false
      clearTimeout(hiddenTimer)
      doc?.removeEventListener("visibilitychange", onVisibility)
      close()
      hub.setStatus("idle")
    },
  }
}
