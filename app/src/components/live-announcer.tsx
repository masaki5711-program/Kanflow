"use client"

import { useSyncExternalStore } from "react"

/**
 * One shared, visually hidden polite live region for the whole app.
 * Components call `announce(message)` instead of rendering their own
 * `aria-live` element (many live regions on one page make screen readers
 * chatty and unreliable). `<LiveAnnouncer />` is mounted once in Providers.
 */

interface AnnouncerState {
  message: string
  /** Bumped on every announce so repeating the same text is re-read. */
  seq: number
}

let state: AnnouncerState = { message: "", seq: 0 }
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function announce(message: string): void {
  state = { message, seq: state.seq + 1 }
  emit()
}

/** Test helper: reset the shared state. */
export function resetAnnouncer(): void {
  state = { message: "", seq: 0 }
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = (): AnnouncerState => state
const SERVER_STATE: AnnouncerState = { message: "", seq: 0 }
const getServerSnapshot = (): AnnouncerState => SERVER_STATE

export function LiveAnnouncer() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-announcer">
      {/* Keyed so an identical repeated message is a fresh text node. */}
      <span key={current.seq}>{current.message}</span>
    </div>
  )
}
