import { syncPbiStatusFromTasks } from "@/lib/pbi-status-sync"
import { CARRY_SOURCE_STATUSES, unfinishedByPbi, withoutTakenOver } from "@/lib/sprint-carry-over"
import { recalcSprintActualScore } from "@/lib/sprint-score"
import { type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError } from "@/services/_shared/errors"
import { enqueueIn } from "@/services/_shared/translations"
import * as repo from "./sprints.repository"

export interface CarryOverRequest {
  fromSprintId: string
  pbItemIds: readonly string[]
}

export interface CarriedTask {
  /** The row in the earlier sprint this one is copied from. */
  sourceId: string
  pbItemId: string
  /** Null = the PBI's bare membership (it had no real task yet). */
  taskName: string | null
  assignee: string | null
  estimatedHours: number | null
  assigneeIds: string[]
}

/** What the new sprint takes over from the earlier one. */
export interface CarryOverPlan {
  /** Every PBI carried over, whether it brings tasks or only its membership. */
  pbIds: string[]
  tasks: CarriedTask[]
}

export const EMPTY_CARRY: CarryOverPlan = { pbIds: [], tasks: [] }

/**
 * Decides what to carry: the open real tasks of the requested PBIs in the
 * source sprint (404 when it is not this project's, 409 while it is still
 * planning / active). A requested PBI that is already finished, not in the
 * sprint, or whose work an earlier carry-over already took, is skipped.
 */
export async function planCarryOver(tx: Db, projectId: string, request: CarryOverRequest): Promise<CarryOverPlan> {
  const source = await repo.findCarryOverSource(tx, projectId, request.fromSprintId)
  if (!source) throw new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND")
  if (!CARRY_SOURCE_STATUSES.includes(source.status)) {
    throw new ConflictError("進行中または計画中のスプリントからは引き継げません", { status: source.status })
  }
  const wanted = new Set(request.pbItemIds)
  const takenOver = new Set(source.items.filter((r) => r.carriedCopies.length > 0).map((r) => r.id))
  const groups = unfinishedByPbi(withoutTakenOver(source.items, takenOver), (r) => ({ pbId: r.pbItemId, taskName: r.taskName, status: r.status }))
    .filter((g) => wanted.has(g.pbId))
  return {
    pbIds: groups.map((g) => g.pbId),
    tasks: groups.flatMap((g) =>
      g.tasks.map((t) => ({
        sourceId: t.id,
        pbItemId: g.pbId,
        taskName: t.taskName,
        assignee: t.assignee,
        estimatedHours: t.estimatedHours,
        assigneeIds: t.assignees.map((a) => a.userId),
      })),
    ),
  }
}

/**
 * Copies the planned tasks into the new sprint (same transaction) as "todo"
 * rows linked to their originals, and brings the sprint's score and the PBIs'
 * status in line. The source sprint is not touched: its unfinished tasks stay
 * as its record, and the PBI status rule ignores an original once it has a copy.
 */
export async function insertCarriedTasks(tx: Db, sprintId: string, plan: CarryOverPlan): Promise<void> {
  for (const { sourceId, assigneeIds, ...fields } of plan.tasks) {
    const created = await repo.insertCarriedTask(tx, { sprintId, carriedFromId: sourceId, ...fields }, assigneeIds)
    if (created.taskName) await enqueueIn(tx, "sprint_task", created.id, created)
  }
  if (plan.pbIds.length === 0) return
  await recalcSprintActualScore(sprintId, tx)
  for (const pbItemId of plan.pbIds) await syncPbiStatusFromTasks(pbItemId, tx)
}
