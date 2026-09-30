/**
 * Per-viewer plan preferences in localStorage (collapsed rows, grid columns).
 * Every access is guarded: private mode / blocked storage just means defaults.
 */
export type PlanColumn = "start" | "end" | "duration" | "progress" | "owner" | "status"
export const PLAN_COLUMNS: readonly PlanColumn[] = ["start", "end", "duration", "progress", "owner", "status"]

export interface PlanPrefs {
  collapsed: string[]
  hiddenColumns: PlanColumn[]
  /** Grid collapsed to the name column only (null = decide by viewport width). */
  gridCollapsed: boolean | null
}

export const DEFAULT_PREFS: PlanPrefs = Object.freeze({ collapsed: [], hiddenColumns: [], gridCollapsed: null }) as PlanPrefs

export const prefsKey = (projectId: string) => `kanflow:plan:${projectId}`

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])

export function parsePrefs(raw: string | null): PlanPrefs {
  if (!raw) return DEFAULT_PREFS
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    return {
      collapsed: strings(obj.collapsed),
      hiddenColumns: strings(obj.hiddenColumns).filter((c): c is PlanColumn => (PLAN_COLUMNS as readonly string[]).includes(c)),
      gridCollapsed: typeof obj.gridCollapsed === "boolean" ? obj.gridCollapsed : null,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

/** Fallback used only while storage is blocked: preferences still work for this page session. */
const memory = new Map<string, string>()

export function readPrefsRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

export function writePrefsRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    memory.set(key, value)
  }
}

export function loadPrefs(projectId: string): PlanPrefs {
  return parsePrefs(readPrefsRaw(prefsKey(projectId)))
}

export function savePrefs(projectId: string, prefs: PlanPrefs): void {
  writePrefsRaw(prefsKey(projectId), JSON.stringify(prefs))
}
