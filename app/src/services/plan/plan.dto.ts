/**
 * Plan item DTOs (the GET /plan contract). Pure: callers load rows, linked
 * PBIs and translations; this module shapes them.
 */
import type { EntityI18n } from "@/lib/translation/types"
import {
  baselineVarianceDays,
  computeScheduleState,
  toDateKey,
  toDateKeyOrNull,
  type LinkedPbi,
  type ProgressMode,
  type ScheduleState,
} from "@/lib/plan-progress"

export interface PlanSprintRef {
  id: string
  name: string
  startDate: string
  endDate: string
  status: string
}

export interface PlanLinkedSummary {
  pbiCount: number
  pbiDone: number
  pointsTotal: number
  pointsDone: number
  sprints: PlanSprintRef[]
}

export interface PlanItemDto {
  id: string
  projectId: string
  parentId: string | null
  name: string
  description: string | null
  notes: string | null
  plannedStart: string
  plannedEnd: string
  actualStart: string | null
  actualEnd: string | null
  baselineStart: string | null
  baselineEnd: string | null
  baselineVarianceDays: number | null
  progressPct: number
  progressMode: ProgressMode
  status: string
  scheduleState: ScheduleState
  isMilestone: boolean
  color: string | null
  sortOrder: number
  version: number
  owner: { id: string; name: string } | null
  hasChildren: boolean
  linked: PlanLinkedSummary | null
  i18n: EntityI18n
}

export interface PlanDependencyDto {
  id: string
  predecessorId: string
  successorId: string
}

export interface PlanListDto {
  items: PlanItemDto[]
  dependencies: PlanDependencyDto[]
  /** Asia/Tokyo calendar day the scheduleState values were computed for. */
  today: string
}

/** A plan row as loaded (with owner). */
export interface PlanRow {
  id: string
  projectId: string
  parentId: string | null
  name: string
  description: string | null
  notes: string | null
  plannedStart: Date
  plannedEnd: Date
  actualStart: Date | null
  actualEnd: Date | null
  baselineStart: Date | null
  baselineEnd: Date | null
  progressPct: number
  progressMode: string
  status: string
  isMilestone: boolean
  color: string | null
  sortOrder: number
  version: number
  owner: { id: string; name: string } | null
}

/** A linked PBI as loaded for aggregation (sprint rows distinct per sprint). */
export interface LinkedPbiRow {
  planItemId: string | null
  status: string
  workloadScore: number | null
  sprintItems: ReadonlyArray<{ sprint: { id: string; sprintName: string; startDate: Date; endDate: Date; status: string } }>
}

export function toLinkedPbi(r: LinkedPbiRow): LinkedPbi {
  return { status: r.status, points: r.workloadScore ?? 0, inSprint: r.sprintItems.length > 0 }
}

/** Pure: per plan item, the summary of its live linked PBIs (sprints sorted by start). */
export function summarizeLinked(rows: readonly LinkedPbiRow[]): Map<string, PlanLinkedSummary> {
  const acc = new Map<string, { s: PlanLinkedSummary; sprints: Map<string, PlanSprintRef> }>()
  for (const r of rows) {
    if (!r.planItemId) continue
    const cur = acc.get(r.planItemId) ?? { s: { pbiCount: 0, pbiDone: 0, pointsTotal: 0, pointsDone: 0, sprints: [] }, sprints: new Map() }
    const points = Math.max(0, r.workloadScore ?? 0)
    const done = r.status === "completed"
    cur.s = {
      ...cur.s,
      pbiCount: cur.s.pbiCount + 1,
      pbiDone: cur.s.pbiDone + (done ? 1 : 0),
      pointsTotal: cur.s.pointsTotal + points,
      pointsDone: cur.s.pointsDone + (done ? points : 0),
    }
    for (const { sprint } of r.sprintItems) {
      cur.sprints.set(sprint.id, {
        id: sprint.id,
        name: sprint.sprintName,
        startDate: toDateKey(sprint.startDate),
        endDate: toDateKey(sprint.endDate),
        status: sprint.status,
      })
    }
    acc.set(r.planItemId, cur)
  }
  const out = new Map<string, PlanLinkedSummary>()
  for (const [id, { s, sprints }] of acc) {
    out.set(id, { ...s, sprints: Array.from(sprints.values()).toSorted((a, b) => a.startDate.localeCompare(b.startDate)) })
  }
  return out
}

export interface DtoContext {
  hasChildren: boolean
  linked: PlanLinkedSummary | undefined
  i18n: EntityI18n | undefined
  today: string
}

function emptyLinked(): PlanLinkedSummary {
  return { pbiCount: 0, pbiDone: 0, pointsTotal: 0, pointsDone: 0, sprints: [] }
}

/** Pure: the PlanItemDto of a row. `linked` is null for parents; for leaves it is set when PBIs are linked or the mode is "linked". */
export function toPlanItemDto(row: PlanRow, ctx: DtoContext): PlanItemDto {
  const mode: ProgressMode = row.progressMode === "linked" ? "linked" : "manual"
  const linked = ctx.hasChildren ? null : ctx.linked ?? (mode === "linked" ? emptyLinked() : null)
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    name: row.name,
    description: row.description,
    notes: row.notes,
    plannedStart: toDateKey(row.plannedStart),
    plannedEnd: toDateKey(row.plannedEnd),
    actualStart: toDateKeyOrNull(row.actualStart),
    actualEnd: toDateKeyOrNull(row.actualEnd),
    baselineStart: toDateKeyOrNull(row.baselineStart),
    baselineEnd: toDateKeyOrNull(row.baselineEnd),
    baselineVarianceDays: baselineVarianceDays(row.plannedEnd, row.baselineEnd),
    progressPct: row.progressPct,
    progressMode: mode,
    status: row.status,
    scheduleState: computeScheduleState(row, ctx.today),
    isMilestone: row.isMilestone,
    color: row.color,
    sortOrder: row.sortOrder,
    version: row.version,
    owner: row.owner ? { id: row.owner.id, name: row.owner.name } : null,
    hasChildren: ctx.hasChildren,
    linked,
    i18n: ctx.i18n ?? {},
  }
}
