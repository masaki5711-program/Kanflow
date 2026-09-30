"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import type { Density, SortBy, ViewMode } from "./types"

/** Same-tab change notification (the native `storage` event only fires in other tabs). */
const PREF_EVENT = "kanflow:project-list-pref"

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Storage blocked (private mode / policy): fall back to defaults.
    return null
  }
}

function writePref(key: string, value: string): void {
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
function useRawPref(key: string): string | null {
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

const VIEW_MODES: readonly ViewMode[] = ["flat", "category"]
const DENSITIES: readonly Density[] = ["comfortable", "compact"]
const SORTS: readonly SortBy[] = ["updated", "name", "name_asc", "progress", "favorite"]

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
  const [viewMode, setViewMode] = useEnumPref("projectViewMode", VIEW_MODES, "flat")
  const [density, setDensity] = useEnumPref("projectDensity", DENSITIES, "comfortable")
  const [sortBy, setSortBy] = useEnumPref("projectSortBy", SORTS, "updated")

  const collapsedRaw = useRawPref("collapsedSections")
  const collapsedSections = useMemo(() => parseCollapsed(collapsedRaw), [collapsedRaw])
  const toggleSection = useCallback(
    (key: string) => {
      const current = parseCollapsed(readPref("collapsedSections"))
      writePref("collapsedSections", JSON.stringify({ ...current, [key]: !current[key] }))
    },
    [],
  )

  return { viewMode, setViewMode, density, setDensity, sortBy, setSortBy, collapsedSections, toggleSection }
}
