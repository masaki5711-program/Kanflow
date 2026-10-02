"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Desktop sidebar width: full (labels) or an icon-only rail, remembered per
 * browser. Same failure policy as sidebar-collapse.ts: blocked storage keeps
 * the choice for this page only.
 */
export const SIDEBAR_RAIL_KEY = "kanflow:sidebar-rail"

const listeners = new Set<() => void>()
let memory = false
let storageBroken = false

function read(): boolean {
  if (storageBroken) return memory
  try {
    return window.localStorage.getItem(SIDEBAR_RAIL_KEY) === "1"
  } catch {
    storageBroken = true
    return memory
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === SIDEBAR_RAIL_KEY) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function write(rail: boolean): void {
  memory = rail
  try {
    window.localStorage.setItem(SIDEBAR_RAIL_KEY, rail ? "1" : "0")
  } catch {
    storageBroken = true
  }
  for (const l of listeners) l()
}

export function useSidebarRail(): { isRail: boolean; toggle: () => void } {
  const isRail = useSyncExternalStore(subscribe, read, () => false)
  const toggle = useCallback(() => write(!read()), [])
  return { isRail, toggle }
}

/** Test seam: forget the in-memory state (does not touch localStorage). */
export function resetSidebarRailStore(): void {
  memory = false
  storageBroken = false
}
