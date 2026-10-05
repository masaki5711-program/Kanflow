import { computeScheduleState, toDateKeyOrNull, type ScheduleState } from "@/lib/plan-progress"
import { checklistKey, stageConditions } from "@/lib/milestones/checklist"

/**
 * Pure: the board's stages from the live plan rows. A stage IS a top-level
 * plan item (name, dates, status, milestone flag and version are its own);
 * its 完了条件 come from its notes, the ticks from milestone_checklist_state.
 * Descendants are listed as the stage's steps (plan order, with depth).
 */

export interface PlanRow {
  id: string
  parentId: string | null
  name: string
  i18n?: unknown
  status: string
  progressPct: number
  plannedStart: Date | null
  plannedEnd: Date | null
  actualStart: Date | null
  actualEnd: Date | null
  isMilestone: boolean
  notes: string | null
  version: number
  checklistStates: ReadonlyArray<{ label: string; checkedByName: string | null; checkedAt: Date }>
}

export interface ConditionDto {
  label: string
  checked: boolean
  checkedByName: string | null
  checkedAt: string | null
}

export interface StepDto {
  id: string
  name: string
  i18n: unknown
  status: string
  scheduleState: ScheduleState
  plannedStart: string | null
  plannedEnd: string | null
  isMilestone: boolean
  depth: number
}

export interface StageDto extends Omit<StepDto, "depth"> {
  actualStart: string | null
  actualEnd: string | null
  progressPct: number
  hasChildren: boolean
  version: number
  /** The plan item's notes (the board rewrites the 完了条件 block through the plan API). */
  notes: string | null
  conditions: ConditionDto[]
  steps: StepDto[]
}

function conditionsOf(row: PlanRow): ConditionDto[] {
  const ticks = new Map(row.checklistStates.map((s) => [s.label, s]))
  return stageConditions(row.notes).map((label) => {
    const tick = ticks.get(checklistKey(label))
    return { label, checked: Boolean(tick), checkedByName: tick?.checkedByName ?? null, checkedAt: tick?.checkedAt.toISOString() ?? null }
  })
}

function baseOf(row: PlanRow, todayKey: string): Omit<StepDto, "depth"> {
  return {
    id: row.id,
    name: row.name,
    i18n: row.i18n ?? {},
    status: row.status,
    scheduleState: computeScheduleState(row, todayKey),
    plannedStart: toDateKeyOrNull(row.plannedStart),
    plannedEnd: toDateKeyOrNull(row.plannedEnd),
    isMilestone: row.isMilestone,
  }
}

function stepOf(row: PlanRow, depth: number, todayKey: string): StepDto {
  return { ...baseOf(row, todayKey), depth }
}

/** Descendants of `parentId` depth-first in the rows' (plan) order. */
function descendants(byParent: ReadonlyMap<string, PlanRow[]>, parentId: string, depth: number, todayKey: string): StepDto[] {
  return (byParent.get(parentId) ?? []).flatMap((child) => [stepOf(child, depth, todayKey), ...descendants(byParent, child.id, depth + 1, todayKey)])
}

/** Rows must come in plan display order (sortOrder, createdAt). */
export function buildStages(rows: readonly PlanRow[], todayKey: string): StageDto[] {
  const ids = new Set(rows.map((r) => r.id))
  const byParent = new Map<string, PlanRow[]>()
  for (const r of rows) {
    if (r.parentId && ids.has(r.parentId)) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r])
  }
  // A row whose parent is gone (trashed) is shown as a stage of its own rather than lost.
  const tops = rows.filter((r) => !r.parentId || !ids.has(r.parentId))
  return tops.map((row) => {
    return {
      ...baseOf(row, todayKey),
      actualStart: toDateKeyOrNull(row.actualStart),
      actualEnd: toDateKeyOrNull(row.actualEnd),
      progressPct: row.progressPct,
      hasChildren: byParent.has(row.id),
      version: row.version,
      notes: row.notes,
      conditions: conditionsOf(row),
      steps: descendants(byParent, row.id, 1, todayKey),
    }
  })
}
