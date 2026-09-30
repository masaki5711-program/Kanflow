/**
 * The backlog page's search / facet filters for the Excel export (F-09):
 * `GET /backlog/export?q=&status=&goal=&epic=&points=&po=&plan=` exports only
 * the PBIs the page shows with the same URL. Same semantics as the page's
 * url-state.ts (`matchesFilters`): "" = any, FILTER_NONE = the field is empty,
 * `q` = case-insensitive substring of the texts or the displayId.
 * Pure (no I/O).
 */
export const EXPORT_FILTER_NONE = "__none"

const STATUSES = ["ready", "not_ready", "completed"] as const
const MAX_FILTER_CHARS = 200

export interface BacklogExportFilters {
  q: string
  status: string
  goal: string
  epic: string
  points: string
  po: string
  plan: string
}

export const NO_EXPORT_FILTERS: BacklogExportFilters = Object.freeze({ q: "", status: "", goal: "", epic: "", points: "", po: "", plan: "" })

/** The row fields the filters look at. */
export interface FilterableBacklogRow {
  displayId: number
  status: string
  initiative: string | null
  epic: string | null
  userStory: string | null
  acceptanceCriteria: string | null
  assignedPo: string | null
  workloadScore: number
  productGoalId: string | null
  /** Live (not trashed) master-plan item id. */
  planItemId: string | null
}

const text = (sp: URLSearchParams, key: string) => (sp.get(key) ?? "").slice(0, MAX_FILTER_CHARS)

/** Query params → filters. Invalid status / points are ignored (like the page does). */
export function parseBacklogExportFilters(sp: URLSearchParams): BacklogExportFilters {
  const status = text(sp, "status")
  const points = text(sp, "points")
  return {
    q: text(sp, "q").toLowerCase().trim(),
    status: (STATUSES as readonly string[]).includes(status) ? status : "",
    goal: text(sp, "goal"),
    epic: text(sp, "epic"),
    points: /^\d+$/.test(points) ? points : "",
    po: text(sp, "po"),
    plan: text(sp, "plan"),
  }
}

export function hasExportFilters(f: BacklogExportFilters): boolean {
  return Object.values(f).some((v) => v !== "")
}

function matchesFacet(value: string | null, filter: string): boolean {
  if (!filter) return true
  if (filter === EXPORT_FILTER_NONE) return !value
  return value === filter
}

function matchesText(row: FilterableBacklogRow, q: string): boolean {
  if (!q) return true
  return (
    [row.initiative, row.epic, row.userStory, row.acceptanceCriteria].some((v) => (v ?? "").toLowerCase().includes(q)) ||
    String(row.displayId).includes(q)
  )
}

export function matchesExportFilters(row: FilterableBacklogRow, f: BacklogExportFilters): boolean {
  return (
    (!f.plan || row.planItemId === f.plan) &&
    (!f.status || row.status === f.status) &&
    matchesFacet(row.productGoalId, f.goal) &&
    matchesFacet(row.epic, f.epic) &&
    matchesFacet(row.assignedPo, f.po) &&
    (!f.points || row.workloadScore === Number(f.points)) &&
    matchesText(row, f.q)
  )
}
