/**
 * Backlog view state that lives in the URL (shareable, survives reload):
 *
 *   ?pbi=<id | displayId>   open PBI modal (deep link target of notifications / search / activity)
 *   ?q=                     text search
 *   ?status= ?goal= ?epic= ?points= ?po=   facet filters (FILTER_NONE = "not set")
 *   ?showDone=1             show the completed section
 *
 * Pure helpers only; the hook in use-backlog-url-state.ts wires them to the router.
 */
import { matchesQuery, type BacklogItem, type BacklogStatus } from "./types"

export type StatusFilter = BacklogStatus | ""

export interface BacklogFilters {
  q: string
  status: StatusFilter
  /** Product goal id, FILTER_NONE, or "" (any). */
  goal: string
  /** Epic text, FILTER_NONE, or "" (any). */
  epic: string
  /** Workload score as a string, or "" (any). */
  points: string
  /** Assigned PO name, FILTER_NONE, or "" (any). */
  po: string
  showDone: boolean
}

/** Facet value meaning "the field is empty". */
export const FILTER_NONE = "__none"

export const EMPTY_FILTERS: BacklogFilters = Object.freeze({
  q: "",
  status: "",
  goal: "",
  epic: "",
  points: "",
  po: "",
  showDone: false,
}) as BacklogFilters

const STATUSES: readonly BacklogStatus[] = ["ready", "not_ready", "completed"]
const TEXT_KEYS = ["q", "status", "goal", "epic", "points", "po"] as const

/** Anything with URLSearchParams' read API (Next's ReadonlyURLSearchParams included). */
type ParamsLike = Pick<URLSearchParams, "get" | "toString">

export function parseFilters(sp: ParamsLike): BacklogFilters {
  const status = sp.get("status") ?? ""
  const points = sp.get("points") ?? ""
  return {
    q: sp.get("q") ?? "",
    status: (STATUSES as readonly string[]).includes(status) ? (status as BacklogStatus) : "",
    goal: sp.get("goal") ?? "",
    epic: sp.get("epic") ?? "",
    points: /^\d+$/.test(points) ? points : "",
    po: sp.get("po") ?? "",
    showDone: sp.get("showDone") === "1",
  }
}

/** New params with `patch` applied; empty values are removed, other keys (pbi, …) kept. */
export function filtersToParams(current: ParamsLike, patch: Partial<BacklogFilters>): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  for (const key of TEXT_KEYS) {
    const value = patch[key]
    if (value === undefined) continue
    if (value) next.set(key, value)
    else next.delete(key)
  }
  if (patch.showDone !== undefined) {
    if (patch.showDone) next.set("showDone", "1")
    else next.delete("showDone")
  }
  return next
}

/** New params with `?pbi=` set (ref) or removed (null). */
export function withPbiParam(current: ParamsLike, ref: string | null): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  if (ref) next.set("pbi", ref)
  else next.delete("pbi")
  return next
}

/** True when a text / facet filter narrows the list (showDone is a view toggle, not a filter). */
export function hasActiveFilters(f: BacklogFilters): boolean {
  return !!(f.q.trim() || f.status || f.goal || f.epic || f.points || f.po)
}

function matchesFacet(value: string | null | undefined, filter: string): boolean {
  if (!filter) return true
  if (filter === FILTER_NONE) return !value
  return value === filter
}

export function matchesFilters(item: BacklogItem, f: BacklogFilters): boolean {
  return (
    (!f.status || item.status === f.status) &&
    matchesFacet(item.productGoalId, f.goal) &&
    matchesFacet(item.epic, f.epic) &&
    matchesFacet(item.assignedPo, f.po) &&
    (!f.points || item.workloadScore === Number(f.points)) &&
    matchesQuery(item, f.q.toLowerCase().trim())
  )
}

export interface FacetOptions {
  goals: NonNullable<BacklogItem["productGoal"]>[]
  epics: string[]
  points: number[]
  pos: string[]
  /** Whether any item lacks the field (offer the "not set" option). */
  hasMissing: { goal: boolean; epic: boolean; po: boolean }
}

const byText = (a: string, b: string) => a.localeCompare(b)

/** Distinct values present in the backlog, for the facet dropdowns. */
export function facetOptions(items: readonly BacklogItem[]): FacetOptions {
  const goals = new Map<string, NonNullable<BacklogItem["productGoal"]>>()
  const epics = new Set<string>()
  const points = new Set<number>()
  const pos = new Set<string>()
  const hasMissing = { goal: false, epic: false, po: false }
  for (const item of items) {
    if (item.productGoal) goals.set(item.productGoal.id, item.productGoal)
    else hasMissing.goal = true
    if (item.epic) epics.add(item.epic)
    else hasMissing.epic = true
    if (item.assignedPo) pos.add(item.assignedPo)
    else hasMissing.po = true
    points.add(item.workloadScore)
  }
  return {
    goals: [...goals.values()].sort((a, b) => byText(a.title, b.title)),
    epics: [...epics].sort(byText),
    points: [...points].sort((a, b) => a - b),
    pos: [...pos].sort(byText),
    hasMissing,
  }
}

/**
 * PBI id for a `?pbi=` value: an id, a displayId or "#displayId". An unknown
 * id is passed through (the modal shows its not-found state); an unknown
 * number cannot be turned into an id and yields null.
 */
export function pbiIdForRef(ref: string, items: readonly BacklogItem[]): string | null {
  const trimmed = ref.trim()
  if (!trimmed) return null
  const byId = items.find((i) => i.id === trimmed)
  if (byId) return byId.id
  const num = /^#?(\d+)$/.exec(trimmed)
  if (!num) return trimmed
  return items.find((i) => i.displayId === Number(num[1]))?.id ?? null
}
