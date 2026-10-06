"use client"

import { useContext, useEffect, useRef, useSyncExternalStore } from "react"
import { quietActivityFor } from "@/hooks/activity"
import type { RealtimeEventType } from "@/lib/realtime/types"
import { RealtimeContext } from "./realtime-provider"
import type { RealtimeSignal } from "./realtime-hub"

/** Default coalescing window: the first matching event starts it, later ones join the same refresh. */
export const LIVE_DEBOUNCE_MS = 500
/** Extra random delay of a catch-up, so 50 tabs reconnecting together do not refetch in the same instant. */
export const RESYNC_JITTER_MS = 1_000
/** Requests a live refresh starts within this window do not count as user activity (idle logout). */
export const LIVE_QUIET_MS = 3_000

export interface LiveFilter {
  types: readonly RealtimeEventType[]
  /** Only events of this project (events of other projects are ignored). */
  projectId?: string | null
  /** Only these entity types (an event without entityType never matches a filter that sets this). */
  entityTypes?: readonly string[]
  /** Only these entities; a collapsed bulk event (no entityId) matches any. */
  entityIds?: readonly string[] | string | null
}

export interface LiveRefetchOptions extends LiveFilter {
  debounceMs?: number
  /** false = not subscribed at all (default true). */
  enabled?: boolean
  /** true = hold refreshes (e.g. while dragging); one runs when unpaused if any was due. */
  paused?: boolean
  /** Also refresh on catch-up after a reconnect / hidden tab (default true). */
  resync?: boolean
}

/** Pure: does a signal concern a view with this filter? */
export function matchesFilter(signal: RealtimeSignal, filter: LiveFilter & { resync?: boolean }): boolean {
  if (signal.type === "resync") return filter.resync !== false
  if (!filter.types.includes(signal.type)) return false
  if (filter.projectId && signal.projectId !== filter.projectId) return false
  if (filter.entityTypes && (!signal.entityType || !filter.entityTypes.includes(signal.entityType))) return false
  if (filter.entityIds != null && signal.entityId) {
    const ids = typeof filter.entityIds === "string" ? [filter.entityIds] : filter.entityIds
    if (!ids.includes(signal.entityId)) return false
  }
  return true
}

function delayFor(signals: readonly RealtimeSignal[], debounceMs: number): number {
  const isResync = signals.some((s) => s.type === "resync")
  return debounceMs + (isResync ? Math.floor(Math.random() * RESYNC_JITTER_MS) : 0)
}

/**
 * Run `onChange` (usually a query's `refetch`) when real-time events matching
 * the filter arrive — coalesced over `debounceMs` — and once after a
 * catch-up. `onChange` gets the signals of the window (most callers ignore
 * them). Outside a RealtimeProvider it never fires; existing polling stays
 * the fallback.
 */
export function useLiveRefetch(onChange: (signals: readonly RealtimeSignal[]) => void, options: LiveRefetchOptions): void {
  const hub = useContext(RealtimeContext)
  const enabled = options.enabled !== false
  const latest = useRef({ onChange, options })
  const pending = useRef<RealtimeSignal[]>([])
  const held = useRef(false)
  useEffect(() => {
    latest.current = { onChange, options }
  })

  useEffect(() => {
    if (!hub || !enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const fire = () => {
      timer = undefined
      if (latest.current.options.paused) {
        held.current = true
        return
      }
      const signals = pending.current
      pending.current = []
      quietActivityFor(LIVE_QUIET_MS)
      latest.current.onChange(signals)
    }
    const unsubscribe = hub.subscribe((signal) => {
      if (!matchesFilter(signal, latest.current.options)) return
      pending.current = [...pending.current, signal]
      timer ??= setTimeout(fire, delayFor(pending.current, latest.current.options.debounceMs ?? LIVE_DEBOUNCE_MS))
    })
    return () => {
      unsubscribe()
      clearTimeout(timer)
      pending.current = []
    }
  }, [hub, enabled])

  // Unpaused with a refresh due: run it now.
  const paused = options.paused === true
  useEffect(() => {
    if (paused || !held.current) return
    held.current = false
    const signals = pending.current
    pending.current = []
    quietActivityFor(LIVE_QUIET_MS)
    latest.current.onChange(signals)
  }, [paused])
}

const NO_HUB_STATUS = () => "idle" as const
const noopSubscribe = () => () => {}

/** True while the real-time stream is connected (polling may then slow down). */
export function useRealtimeConnected(): boolean {
  const hub = useContext(RealtimeContext)
  const status = useSyncExternalStore(
    hub ? hub.subscribeStatus : noopSubscribe,
    hub ? hub.getStatus : NO_HUB_STATUS,
    NO_HUB_STATUS,
  )
  return status === "open"
}
