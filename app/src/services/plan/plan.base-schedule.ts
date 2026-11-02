/**
 * Load a base schedule (W12, `schedule.yml` of a spec template) into 全体計画: the approved form of a
 * `plan_load` proposal (chat card) — POST /plan/load. Dates are always recomputed here from the start date
 * (a stored proposal's preview is never trusted). One transaction: all rows, dependencies and the progress
 * recalculation, or nothing. New rows go after the existing top-level rows.
 *
 * plan 12 E0 (learning from actuals): the same transaction records the load (plan_schedule_load: sourceRef,
 * lineage, sha256 of the canonical schedule JSON, the schedule, start date) before the rows, stamps every
 * created row — parents and leaves — with its schedule item key (templateKey) and the load (scheduleLoadId),
 * and sets the baseline to the planned dates once the recalculation has derived the parents' spans.
 */
import { createHash } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { dateFromKey, recalcPlanProgress } from "@/lib/plan-progress"
import { planBaseSchedule, PlanScheduleError, type BaseSchedule } from "@/lib/plan-schedule/base-schedule"
import { canonicalJson, defaultLineage } from "@/lib/plan-schedule/schedule-source"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { withTransaction } from "@/services/_shared/db"
import { ConflictError, isUniqueViolation, ValidationError } from "@/services/_shared/errors"
import { enqueueIn } from "@/services/_shared/translations"
import * as planRepo from "./plan.repository"

export interface LoadBaseScheduleResult {
  createdCount: number
  dependencyCount: number
  rootIds: string[]
  plannedStart: string
  plannedEnd: string
}

export interface LoadBaseScheduleInput {
  startDate: string
  schedule: BaseSchedule
  proposalId?: string
  /** Where the schedule came from (validated by the route: schedule-source.ts sourceRefSchema). */
  sourceRef?: string
  /** Template family name; derived by defaultLineage when absent. */
  lineage?: string
}

const alreadyLoaded = () => new ConflictError("This plan proposal was already loaded", {}, "PLAN_ALREADY_LOADED")

export async function loadBaseSchedule(projectId: string, input: LoadBaseScheduleInput, actor: Actor): Promise<LoadBaseScheduleResult> {
  let planned
  try {
    planned = planBaseSchedule(input.schedule, input.startDate)
  } catch (error) {
    if (error instanceof PlanScheduleError) throw new ValidationError(error.message, {}, error.code)
    throw error
  }
  const scheduleHash = createHash("sha256").update(canonicalJson(input.schedule)).digest("hex")
  const sourceRef = input.sourceRef ?? null
  const lineage = input.lineage ?? defaultLineage({ sourceRef, scheduleHash })
  const leafKeys = new Set(planned.rows.filter((r) => !planned.rows.some((c) => c.parentKey === r.key)).map((r) => r.key))
  return withTransaction(async (tx) => {
    // The same approved proposal loads once (a double approval, a replayed request): 409, nothing written.
    if (input.proposalId) {
      if (await planRepo.findPlanLoadMarker(tx, projectId, input.proposalId)) throw alreadyLoaded()
      await planRepo.insertPlanLoadMarker(tx, { projectId, proposalId: input.proposalId, actorId: actor.userId || null, actorName: actor.userName ?? null })
    }
    let load: { id: string }
    try {
      load = await planRepo.insertScheduleLoad(tx, {
        projectId,
        proposalId: input.proposalId ?? null,
        sourceRef,
        lineage,
        scheduleHash,
        content: input.schedule as unknown as Prisma.InputJsonValue,
        startDate: dateFromKey(input.startDate) as Date, // validated by planBaseSchedule above
        skipWeekends: input.schedule.skipWeekends === true,
        estimateRunId: null,
        loadedById: actor.userId || null,
      })
    } catch (error) {
      // Two approvals of one proposal at the same time both pass the marker check; the unique load record
      // lets exactly one through (the other transaction rolls back whole).
      if (input.proposalId && isUniqueViolation(error)) throw alreadyLoaded()
      throw error
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
        templateKey: r.key,
        scheduleLoadId: load.id,
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
    // Baseline = the plan as loaded; after the recalc so the parents' derived spans are included.
    await planRepo.copyBaseline(tx, projectId, [...ids.values()])
    await logActivity(tx, {
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "update",
      actor,
      diff: { changes: { planBaseSchedule: { from: null, to: input.startDate } }, meta: { count: planned.rows.length, dependencies: dependencyCount, scheduleLoadId: load.id } },
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
