import { REALTIME_EVENT_TYPES, type RealtimeEventType, type RealtimeWireEvent } from "@/lib/realtime/types"

/**
 * What listeners receive: a server event, or "resync" — the connection was
 * down / the tab was hidden, so events may have been missed and every live
 * view should refresh once (catch-up).
 */
export type RealtimeSignal = RealtimeWireEvent | { type: "resync" }

/**
 * idle = not started (signed out) · connecting · open = live ·
 * fallback = failing / refused (polling carries the updates) ·
 * unsupported = no EventSource in this browser.
 */
export type RealtimeStatus = "idle" | "connecting" | "open" | "fallback" | "unsupported"

export type SignalListener = (signal: RealtimeSignal) => void

/** Listener registry + connection status shared by the provider, the connection and the hooks. */
export interface RealtimeHub {
  subscribe(listener: SignalListener): () => void
  emit(signal: RealtimeSignal): void
  getStatus(): RealtimeStatus
  setStatus(status: RealtimeStatus): void
  subscribeStatus(listener: () => void): () => void
}

export function createRealtimeHub(): RealtimeHub {
  const listeners = new Set<SignalListener>()
  const statusListeners = new Set<() => void>()
  let status: RealtimeStatus = "idle"
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(signal) {
      for (const listener of [...listeners]) {
        try {
          listener(signal)
        } catch {
          // One broken view must not stop the others from refreshing.
        }
      }
    },
    getStatus: () => status,
    setStatus(next) {
      if (next === status) return
      status = next
      for (const l of [...statusListeners]) l()
    },
    subscribeStatus(listener) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
  }
}

const TYPES: ReadonlySet<string> = new Set(REALTIME_EVENT_TYPES)
const OPTIONAL_STRINGS = ["projectId", "entityType", "entityId", "subjectId", "action", "actorId", "at"] as const

/** Pure: a well-formed event from the SSE `data:` text, or null (never throws). */
export function parseWireEvent(text: string): RealtimeWireEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.type !== "string" || !TYPES.has(r.type)) return null
  const event: RealtimeWireEvent = { type: r.type as RealtimeEventType, at: typeof r.at === "string" ? r.at : "" }
  const extra = Object.fromEntries(OPTIONAL_STRINGS.filter((k) => typeof r[k] === "string").map((k) => [k, r[k]]))
  return { ...event, ...extra }
}

/** Pure: the project id of an app path (`/projects/<id>/...`), else null. */
export function projectIdFromPath(pathname: string | null | undefined): string | null {
  const match = /^\/projects\/([^/?#]+)/.exec(pathname ?? "")
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}
