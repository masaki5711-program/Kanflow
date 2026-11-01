/**
 * Load a base schedule (W12, `schedule.yml` of a spec template) into 全体計画: the approved form of a
 * `plan_load` proposal (chat card) — POST /plan/load. Dates are always recomputed here from the start date
 * (a stored proposal's preview is never trusted). One transaction: all rows, dependencies and the progress
 * recalculation, or nothing. New rows go after the existing top-level rows.
 */
import { dateFromKey, recalcPlanProgress } from "@/lib/plan-progress"
import { planBaseSchedule, PlanScheduleError, type BaseSchedule } from "@/lib/plan-schedule/base-schedule"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { withTransaction } from "@/services/_shared/db"
import { ConflictError, ValidationError } from "@/services/_shared/errors"
import { enqueueIn } from "@/services/_shared/translations"
import * as planRepo from "./plan.repository"

export interface LoadBaseScheduleResult {
  createdCount: number
  dependencyCount: number
  rootIds: string[]
  plannedStart: string
  plannedEnd: string
}

export async function loadBaseSchedule(projectId: string, input: { startDate: string; schedule: BaseSchedule; proposalId?: string }, actor: Actor): Promise<LoadBaseScheduleResult> {
  let planned
  try {
    planned = planBaseSchedule(input.schedule, input.startDate)
  } catch (error) {
    if (error instanceof PlanScheduleError) throw new ValidationError(error.message, {}, error.code)
    throw error
  }
  const leafKeys = new Set(planned.rows.filter((r) => !planned.rows.some((c) => c.parentKey === r.key)).map((r) => r.key))
  return withTransaction(async (tx) => {
    // The same approved proposal loads once (a double approval, a replayed request): 409, nothing written.
    if (input.proposalId) {
      if (await planRepo.findPlanLoadMarker(tx, projectId, input.proposalId)) throw new ConflictError("This plan proposal was already loaded", {}, "PLAN_ALREADY_LOADED")
      await planRepo.insertPlanLoadMarker(tx, { projectId, proposalId: input.proposalId, actorId: actor.userId || null, actorName: actor.userName ?? null })
    }
    const baseSort = await planRepo.nextPlanSortOrder(tx, projectId, null)
    const ids = new Map<string, string>()
    for (const r of planned.rows) {
      const leaf = leafKeys.has(r.key)
      const item = await planRepo.insertPlanItem(tx, {
        projectId,
        parentId: r.parentKey === null ? null : (ids.get(r.parentKey) ?? null),
        name: r.name,
        plannedStart: leaf ? dateFromKey(r.plannedStart) : null,
        plannedEnd: leaf ? dateFromKey(r.plannedEnd) : null,
        isMilestone: r.isMilestone,
        status: "not_started",
        progressPct: 0,
        progressMode: "manual",
        durationDays: r.durationDays,
        sortOrder: r.parentKey === null ? baseSort + r.siblingIndex : r.siblingIndex + 1,
      })
      ids.set(r.key, item.id)
      await enqueueIn(tx, "plan_item", item.id, item)
    }
    let dependencyCount = 0
    for (const r of planned.rows) {
      for (const from of r.dependsOn) {
        await planRepo.insertDependency(tx, { projectId, predecessorId: ids.get(from) as string, successorId: ids.get(r.key) as string })
        dependencyCount += 1
      }
    }
    await recalcPlanProgress(projectId, [...ids.values()], tx)
    await logActivity(tx, {
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "update",
      actor,
      diff: { changes: { planBaseSchedule: { from: null, to: input.startDate } }, meta: { count: planned.rows.length, dependencies: dependencyCount } },
    })
    return {
      createdCount: planned.rows.length,
      dependencyCount,
      rootIds: planned.rows.filter((r) => r.parentKey === null).map((r) => ids.get(r.key) as string),
      plannedStart: planned.plannedStart,
      plannedEnd: planned.plannedEnd,
    }
  })
}
