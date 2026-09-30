/**
 * Per-viewer plan preferences in localStorage (collapsed rows, grid columns,
 * name column width). Every access is guarded: private mode / blocked storage
 * just means defaults.
 */
export type PlanColumn = "period" | "start" | "end" | "duration" | "progress" | "owner" | "status"
/** Canonical column order (the grid always shows visible columns in this order). */
export const PLAN_COLUMNS: readonly PlanColumn[] = ["period", "start", "end", "duration", "progress", "owner", "status"]
/** Shown until the viewer picks columns: compact period + progress keep the timeline wide. */
export const DEFAULT_COLUMNS: readonly PlanColumn[] = ["period", "progress"]
/** Default below the lg breakpoint (tablets): name + progress only, so the timeline keeps ~60%. */
export const TABLET_COLUMNS: readonly PlanColumn[] = ["progress"]

/** Phones: what the narrow chart favours — legible names or the timeline. */
export type PhoneLayout = "names" | "timeline"

export interface PlanPrefs {
  collapsed: string[]
  /** Visible grid columns (null = DEFAULT_COLUMNS). */
  columns: PlanColumn[] | null
  /** Grid collapsed to the name column only (null = decide by viewport width). */
  gridCollapsed: boolean | null
  /** Name column width in px set with the splitter (null = default). */
  nameWidth: number | null
  /** Phone layout toggle (null = timeline first). */
  phoneLayout: PhoneLayout | null
}

export const DEFAULT_PREFS: PlanPrefs = Object.freeze({ collapsed: [], columns: null, gridCollapsed: null, nameWidth: null, phoneLayout: null }) as PlanPrefs

export const prefsKey = (projectId: string) => `kanflow:plan:${projectId}`

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
const isColumn = (c: string): c is PlanColumn => (PLAN_COLUMNS as readonly string[]).includes(c)

export function parsePrefs(raw: string | null): PlanPrefs {
  if (!raw) return DEFAULT_PREFS
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    return {
      collapsed: strings(obj.collapsed),
      // The pre-2026-10 `hiddenColumns` key is ignored on purpose: the new compact default applies.
      columns: Array.isArray(obj.columns) ? [...new Set(strings(obj.columns).filter(isColumn))] : null,
      gridCollapsed: typeof obj.gridCollapsed === "boolean" ? obj.gridCollapsed : null,
      nameWidth: typeof obj.nameWidth === "number" && Number.isFinite(obj.nameWidth) ? Math.round(obj.nameWidth) : null,
      phoneLayout: obj.phoneLayout === "names" || obj.phoneLayout === "timeline" ? obj.phoneLayout : null,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

/** The visible columns a preference selects (the desktop or tablet default when unset). */
export function shownColumns(prefs: Pick<PlanPrefs, "columns">, tablet = false): readonly PlanColumn[] {
  return prefs.columns ?? (tablet ? TABLET_COLUMNS : DEFAULT_COLUMNS)
}

/** Toggle one column on / off (result in canonical order). */
export function toggleColumnIn(shown: readonly PlanColumn[], col: PlanColumn): PlanColumn[] {
  const next = shown.includes(col) ? shown.filter((c) => c !== col) : [...shown, col]
  return PLAN_COLUMNS.filter((c) => next.includes(c))
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
