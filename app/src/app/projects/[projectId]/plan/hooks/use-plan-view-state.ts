"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { parsePrefs, prefsKey, readPrefsRaw, shownColumns, toggleColumnIn, writePrefsRaw, type PlanColumn, type PlanPrefs } from "../lib/prefs"
import { isPlanZoom, type PlanZoom } from "../lib/scale"

export const DEFAULT_ZOOM: PlanZoom = "week"

/** Same-tab change notification (the native `storage` event only fires in other tabs). */
const PREFS_EVENT = "kanflow:plan-prefs"

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(PREFS_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(PREFS_EVENT, onChange)
  }
}

/** Search string with `key` set (or removed when value is null). */
export function withParam(search: string, key: string, value: string | null): string {
  const next = new URLSearchParams(search)
  if (value === null) next.delete(key)
  else next.set(key, value)
  return next.toString()
}

/**
 * View state of the plan page. Shareable state lives in the URL (?zoom=,
 * ?item=); per-viewer layout (collapsed rows, visible columns, name width)
 * lives in localStorage (server render uses the defaults).
 */
export function usePlanViewState(projectId: string) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rawZoom = searchParams?.get("zoom")
  const zoom: PlanZoom = isPlanZoom(rawZoom) ? rawZoom : DEFAULT_ZOOM
  const itemParam = searchParams?.get("item") || null

  const replaceParam = useCallback(
    (key: string, value: string | null) => {
      const qs = withParam(window.location.search, key, value)
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname],
  )
  const setZoom = useCallback((z: PlanZoom) => replaceParam("zoom", z === DEFAULT_ZOOM ? null : z), [replaceParam])
  const clearItemParam = useCallback(() => replaceParam("item", null), [replaceParam])

  const key = prefsKey(projectId)
  const raw = useSyncExternalStore(subscribe, () => readPrefsRaw(key), () => null)
  const prefs = useMemo(() => parsePrefs(raw), [raw])
  const update = useCallback(
    (fn: (p: PlanPrefs) => PlanPrefs) => {
      writePrefsRaw(key, JSON.stringify(fn(parsePrefs(readPrefsRaw(key)))))
      window.dispatchEvent(new Event(PREFS_EVENT))
    },
    [key],
  )

  const setCollapsed = useCallback(
    (fn: (prev: ReadonlySet<string>) => Iterable<string>) => update((p) => ({ ...p, collapsed: [...new Set(fn(new Set(p.collapsed)))] })),
    [update],
  )
  const toggleColumn = useCallback(
    (col: PlanColumn) => update((p) => ({ ...p, columns: toggleColumnIn(shownColumns(p), col) })),
    [update],
  )
  const setGridCollapsed = useCallback((v: boolean) => update((p) => ({ ...p, gridCollapsed: v })), [update])
  const setNameWidth = useCallback((w: number) => update((p) => ({ ...p, nameWidth: Math.round(w) })), [update])
  const columns = useMemo(() => shownColumns(prefs), [prefs])

  return { zoom, setZoom, itemParam, clearItemParam, prefs, columns, setCollapsed, toggleColumn, setGridCollapsed, setNameWidth }
}
