"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import type { Layout, SortBy, ViewMode } from "./types"

/** Same-tab change notification (the native `storage` event only fires in other tabs). */
const PREF_EVENT = "kanflow:project-list-pref"

export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Storage blocked (private mode / policy): fall back to defaults.
    return null
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the preference simply is not remembered (non-critical convenience).
  }
  window.dispatchEvent(new Event(PREF_EVENT))
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(PREF_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(PREF_EVENT, onChange)
  }
}

/** Raw string preference, `null` on the server and when unset (hydration-safe). */
export function useRawPref(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readPref(key),
    () => null,
  )
}

function useEnumPref<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const raw = useRawPref(key)
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
  const set = useCallback((v: T) => writePref(key, v), [key])
  return [value, set]
}

const VIEW_MODES: readonly ViewMode[] = ["flat", "category", "role"]
const LAYOUTS: readonly Layout[] = ["card", "list"]

/** localStorage keys of the list preferences. */
export const PREF_KEYS = {
  layout: "projectLayout",
  /** Pre-"list view" density toggle; "compact" now maps to the list layout. */
  legacyDensity: "projectDensity",
  viewMode: "projectViewMode",
  sortBy: "projectSortBy",
  collapsed: "collapsedSections",
} as const

/**
 * Card / list layout from storage. Without an explicit choice, users of the
 * old compact density keep their dense rows (now the list layout).
 */
export function resolveLayout(raw: string | null, legacyDensity: string | null): Layout {
  if (raw !== null && (LAYOUTS as readonly string[]).includes(raw)) return raw as Layout
  return legacyDensity === "compact" ? "list" : "card"
}
const SORTS: readonly SortBy[] = ["updated", "activity_desc", "activity_asc", "name", "name_asc", "progress", "favorite"]

/**
 * Parse the persisted collapsed-section map. localStorage is untrusted (older
 * versions, manual edits, other code): only plain objects are accepted and
 * only entries whose value is a boolean are kept.
 */
export function parseCollapsed(raw: string | null): Record<string, boolean> {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  )
}

/** View preferences of the project list, persisted per browser in localStorage. */
export function useProjectListPrefs() {
  const [viewMode, setViewMode] = useEnumPref(PREF_KEYS.viewMode, VIEW_MODES, "flat")
  const [sortBy, setSortBy] = useEnumPref(PREF_KEYS.sortBy, SORTS, "updated")
  const layout = resolveLayout(useRawPref(PREF_KEYS.layout), useRawPref(PREF_KEYS.legacyDensity))
  const setLayout = useCallback((v: Layout) => writePref(PREF_KEYS.layout, v), [])

  const collapsedRaw = useRawPref(PREF_KEYS.collapsed)
  const collapsedSections = useMemo(() => parseCollapsed(collapsedRaw), [collapsedRaw])
  const toggleSection = useCallback(
    (key: string) => {
      const current = parseCollapsed(readPref(PREF_KEYS.collapsed))
      writePref(PREF_KEYS.collapsed, JSON.stringify({ ...current, [key]: !current[key] }))
    },
    [],
  )

  return { viewMode, setViewMode, layout, setLayout, sortBy, setSortBy, collapsedSections, toggleSection }
}
