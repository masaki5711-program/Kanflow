/**
 * Which numbers the home hero shows (A3-16): Product Owners get backlog /
 * sprint numbers, everyone with tasks keeps the task counters, and nothing
 * shows as a row of zeros. Pure; `HomeKpis` renders the tiles.
 */
import type { Translations } from "@/lib/i18n"
import { sprintCompletionPct, type PoHomeSummary } from "@/services/projects/po-home-summary.types"

export interface TaskKpis {
  open: number
  overdue: number
  dueThisWeek: number
}

export interface KpiTile {
  key: string
  label: string
  value: string
  /** Small line under the label (e.g. "3/5 tasks done"). */
  note?: string
  alert?: boolean
  href?: string
}

export interface HomeKpiModel {
  tiles: KpiTile[]
  /** Shown instead of the tiles when there is nothing to count. */
  hint: string | null
}

type Labels = Pick<
  Translations,
  | "topKpiOpen"
  | "topKpiOverdue"
  | "topKpiDueThisWeek"
  | "topKpiRefinement"
  | "topKpiReview"
  | "topKpiSprintCompletion"
  | "topKpiTasksDone"
  | "topKpiNoActiveSprint"
  | "topKpiNoTasksHint"
>

function poTiles(po: PoHomeSummary, t: Labels): KpiTile[] {
  const base = po.singleProjectId ? `/projects/${po.singleProjectId}` : null
  const pct = sprintCompletionPct(po)
  const tiles: KpiTile[] = [
    { key: "refinement", label: t.topKpiRefinement, value: String(po.notReady), href: base ? `${base}/backlog?status=not_ready` : undefined },
  ]
  if (po.inReview > 0) tiles.push({ key: "review", label: t.topKpiReview, value: String(po.inReview), href: base ? `${base}/sprints` : undefined })
  tiles.push(
    po.activeSprints > 0
      ? {
          key: "completion",
          label: t.topKpiSprintCompletion,
          value: pct === null ? "—" : `${pct}%`,
          note: t.topKpiTasksDone.replace("{done}", String(po.doneTasks)).replace("{total}", String(po.totalTasks)),
          href: base ? `${base}/sprints` : undefined,
        }
      : { key: "completion", label: t.topKpiSprintCompletion, value: "—", note: t.topKpiNoActiveSprint },
  )
  return tiles
}

export function buildHomeKpis(po: PoHomeSummary | null, tasks: TaskKpis, t: Labels): HomeKpiModel {
  const hasTasks = tasks.open > 0
  if (po) {
    const tiles = poTiles(po, t)
    if (hasTasks) tiles.push({ key: "open", label: t.topKpiOpen, value: String(tasks.open), href: "#my-tasks" })
    if (tasks.overdue > 0) tiles.push({ key: "overdue", label: t.topKpiOverdue, value: String(tasks.overdue), alert: true, href: "#my-tasks" })
    return { tiles, hint: null }
  }
  if (!hasTasks) return { tiles: [], hint: t.topKpiNoTasksHint }
  return {
    tiles: [
      { key: "open", label: t.topKpiOpen, value: String(tasks.open) },
      { key: "overdue", label: t.topKpiOverdue, value: String(tasks.overdue), alert: tasks.overdue > 0 },
      { key: "dueThisWeek", label: t.topKpiDueThisWeek, value: String(tasks.dueThisWeek) },
    ],
    hint: null,
  }
}
