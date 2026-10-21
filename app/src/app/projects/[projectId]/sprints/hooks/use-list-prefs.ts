"use client"

import { useCallback, useState } from "react"

export type ListGroupBy = "pbi" | "assignee"
export type ListDensity = "normal" | "compact"

export interface ListPrefs {
  groupBy: ListGroupBy
  density: ListDensity
}

const KEY = "kanflow:sprintListPrefs"
const DEFAULTS: ListPrefs = { groupBy: "pbi", density: "normal" }

/** Pure: stored JSON → prefs (anything unexpected falls back to the defaults per field). */
export function parseListPrefs(raw: string | null): ListPrefs {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Record<keyof ListPrefs, unknown>>) : {}
    return {
      groupBy: v.groupBy === "assignee" ? "assignee" : DEFAULTS.groupBy,
      density: v.density === "compact" ? "compact" : DEFAULTS.density,
    }
  } catch {
    return DEFAULTS
  }
}

function read(): ListPrefs {
  if (typeof window === "undefined") return DEFAULTS
  try {
    return parseListPrefs(window.localStorage.getItem(KEY))
  } catch {
    // Storage blocked: the choice just is not remembered.
    return DEFAULTS
  }
}

/** How the sprint list is grouped and how tight its rows are; remembered in this browser. */
export function useListPrefs(): ListPrefs & { setGroupBy: (g: ListGroupBy) => void; setDensity: (d: ListDensity) => void } {
  const [prefs, setPrefs] = useState<ListPrefs>(read)
  const update = useCallback((patch: Partial<ListPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Not remembered; the choice still applies to this view.
      }
      return next
    })
  }, [])
  return {
    ...prefs,
    setGroupBy: useCallback((groupBy: ListGroupBy) => update({ groupBy }), [update]),
    setDensity: useCallback((density: ListDensity) => update({ density }), [update]),
  }
}
