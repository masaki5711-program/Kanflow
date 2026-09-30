/**
 * Pure view state of the portfolio page: sorting, KPI totals and the URL
 * form of filters + sort (shareable links).
 */
import { EMPTY_PORTFOLIO_FILTERS, type PortfolioFilters, type PortfolioRow, type Severity } from "@/services/portfolio/portfolio.types"

export const SORT_KEYS = [
  "name",
  "section",
  "status",
  "sprint",
  "overdue",
  "backlog",
  "velocity",
  "surveillance",
  "plan",
  "activity",
] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDir = "asc" | "desc"

export interface PortfolioViewState extends PortfolioFilters {
  sort: SortKey
  dir: SortDir
}

/** Most overdue tasks first (ties by name) — the trouble a manager scans for. */
export const DEFAULT_VIEW: PortfolioViewState = Object.freeze({ ...EMPTY_PORTFOLIO_FILTERS, sort: "overdue", dir: "desc" })

/** First click on a column: numbers / risk descend (worst first), text ascends. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  section: "asc",
  status: "asc",
  sprint: "asc",
  overdue: "desc",
  backlog: "desc",
  velocity: "desc",
  surveillance: "desc",
  plan: "desc",
  activity: "desc",
}

const SEVERITY_RANK: Record<Severity, number> = { none: 1, warning: 2, critical: 3 }

type SortValue = string | number | null

function sortValue(r: PortfolioRow, key: SortKey, displayName: (r: PortfolioRow) => string): SortValue {
  switch (key) {
    case "name": return displayName(r).toLocaleLowerCase()
    case "section": return r.sections[0]?.name.toLocaleLowerCase() ?? null
    case "status": return r.status
    case "sprint": return r.activeSprint?.progressPct ?? null
    case "overdue": return r.overdueTasks
    case "backlog": return r.openPbis
    case "velocity": return r.velocity.at(-1) ?? null
    case "surveillance": return r.surveillance ? SEVERITY_RANK[r.surveillance.severity] : null
    case "plan": return r.plan.total === 0 ? null : r.plan.delayed * 10_000 + r.plan.atRisk * 100 + (100 - (r.plan.progressPct ?? 0)) / 100
    case "activity": return r.lastActivityAt ? Date.parse(r.lastActivityAt) : null
  }
}

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b))
}

/**
 * Pure: rows sorted by `key` (new array). Empty values (no sprint, no plan,
 * never reported) always go last, in either direction; ties keep name order.
 */
export function sortPortfolio(
  rows: readonly PortfolioRow[],
  key: SortKey,
  dir: SortDir,
  displayName: (r: PortfolioRow) => string = (r) => r.name
): PortfolioRow[] {
  const sign = dir === "asc" ? 1 : -1
  return rows.toSorted((ra, rb) => {
    const [a, b] = [sortValue(ra, key, displayName), sortValue(rb, key, displayName)]
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
    return sign * compare(a, b) || displayName(ra).localeCompare(displayName(rb))
  })
}

export interface PortfolioKpis {
  projects: number
  activeSprints: number
  attention: number
  overdueTasks: number
  delayedPlan: number
  critical: number
}

export function portfolioKpis(rows: readonly PortfolioRow[]): PortfolioKpis {
  return {
    projects: rows.length,
    activeSprints: rows.filter((r) => r.activeSprint).length,
    attention: rows.filter((r) => r.needsAttention).length,
    overdueTasks: rows.reduce((n, r) => n + r.overdueTasks, 0),
    delayedPlan: rows.reduce((n, r) => n + r.plan.delayed, 0),
    critical: rows.filter((r) => r.surveillance?.severity === "critical").length,
  }
}

/** `?section=&status=&attention=1&sort=&dir=` → view state (unknown values fall back to the default). */
export function viewFromParams(params: URLSearchParams): PortfolioViewState {
  const sort = params.get("sort")
  const dir = params.get("dir")
  const status = params.get("status")
  const validSort = (SORT_KEYS as readonly string[]).includes(sort ?? "") ? (sort as SortKey) : DEFAULT_VIEW.sort
  return {
    section: params.get("section") ?? "",
    status: status === "active" || status === "archived" ? status : "",
    attentionOnly: params.get("attention") === "1",
    sort: validSort,
    dir: dir === "asc" || dir === "desc" ? dir : sort ? DEFAULT_DIR[validSort] : DEFAULT_VIEW.dir,
  }
}

/** View state → query string without defaults ("" for the default view). */
export function viewToQuery(v: PortfolioViewState): string {
  const q = new URLSearchParams()
  if (v.section) q.set("section", v.section)
  if (v.status) q.set("status", v.status)
  if (v.attentionOnly) q.set("attention", "1")
  if (v.sort !== DEFAULT_VIEW.sort || v.dir !== DEFAULT_VIEW.dir) {
    q.set("sort", v.sort)
    q.set("dir", v.dir)
  }
  const s = q.toString()
  return s ? `?${s}` : ""
}

/** Clicking a header: same column flips the direction, another column starts at its default. */
export function nextSort(v: PortfolioViewState, key: SortKey): Pick<PortfolioViewState, "sort" | "dir"> {
  if (v.sort === key) return { sort: key, dir: v.dir === "asc" ? "desc" : "asc" }
  return { sort: key, dir: DEFAULT_DIR[key] }
}
