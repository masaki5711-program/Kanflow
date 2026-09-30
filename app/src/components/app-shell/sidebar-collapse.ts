"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Which sidebar sections the user collapsed, remembered per browser in
 * localStorage. One module-level store so the desktop aside and the mobile
 * drawer (two SidebarContent instances) stay in sync. Storage failures
 * (private mode, blocked site data) degrade to "everything expanded".
 */
export const SIDEBAR_COLLAPSE_KEY = "kanflow:sidebar-collapsed"

const listeners = new Set<() => void>()
let cachedRaw: string | null = null
let cachedIds: readonly string[] = []
/** Fallback when localStorage cannot be written: state lives for this page only. */
let memoryRaw: string | null = null
let storageBroken = false
const EMPTY: readonly string[] = []

function readRaw(): string | null {
  if (storageBroken) return memoryRaw
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY)
  } catch {
    storageBroken = true
    return memoryRaw
  }
}

/** Pure: stored JSON → the list of collapsed group ids (malformed → []). */
export function parseCollapsed(raw: string | null): readonly string[] {
  if (!raw) return EMPTY
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : EMPTY
  } catch {
    return EMPTY
  }
}

function getSnapshot(): readonly string[] {
  const raw = readRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedIds = parseCollapsed(raw)
  }
  return cachedIds
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === SIDEBAR_COLLAPSE_KEY) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function writeCollapsed(ids: readonly string[]): void {
  const raw = JSON.stringify(ids)
  memoryRaw = raw
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, raw)
  } catch {
    storageBroken = true
  }
  for (const l of listeners) l()
}

export interface CollapsedGroups {
  isCollapsed: (id: string) => boolean
  toggle: (id: string) => void
}

export function useCollapsedGroups(): CollapsedGroups {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
  const isCollapsed = useCallback((id: string) => collapsed.includes(id), [collapsed])
  const toggle = useCallback(
    (id: string) => {
      const current = getSnapshot()
      writeCollapsed(current.includes(id) ? current.filter((g) => g !== id) : [...current, id])
    },
    [],
  )
  return { isCollapsed, toggle }
}

/** Test seam: forget the cached / in-memory state (does not touch localStorage). */
export function resetSidebarCollapseStore(): void {
  cachedRaw = null
  cachedIds = EMPTY
  memoryRaw = null
  storageBroken = false
}
