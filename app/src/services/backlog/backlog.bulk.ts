/**
 * Bulk operations on PBIs (POST /backlog/bulk). Authorization per action is
 * decided in the route; this module only needs the actor for history rows
 * and notifications.
 *
 * Every action runs in ONE transaction: a failure leaves no PBI half-updated
 * (addToSprint reuses the sprint-backlog service, which has its own). Each
 * touched PBI gets its own activity row (`meta.bulk: true`) so its History
 * tab stays complete.
 */
import { recalcPlanItems } from "@/lib/plan-progress"
import type { Actor } from "@/services/_shared/actor"
import { labelOf, logActivity, logUpdate } from "@/services/_shared/activity"
import { withTransaction, type Db } from "@/services/_shared/db"
import { resolveAssigneeUserIds } from "@/services/_shared/notifications"
import { assertLinkablePlanItem } from "@/services/plan/plan.links"
import { addPbisToSprint } from "@/services/sprint-backlog/sprint-backlog.service"
import * as repo from "./backlog.repository"
import type { BulkBacklogAction, BulkBacklogInput, PbiStatus } from "./backlog.schemas"
import { completionPatch, notifyPbiAssigned, rescoreSprintsOf } from "./backlog.service"

export interface BulkBacklogResult {
  action: BulkBacklogAction
  /** PBIs actually changed. */
  affectedIds: string[]
  /** Requested PBIs left alone: missing, trashed, other project, or already in the requested state. */
  skippedIds: string[]
}

type LiveRow = Awaited<ReturnType<typeof repo.findLiveBacklogItemsByIds>>[number]

function result(action: BulkBacklogAction, requested: readonly string[], affectedIds: string[]): BulkBacklogResult {
  const affected = new Set(affectedIds)
  return { action, affectedIds, skippedIds: requested.filter((id) => !affected.has(id)) }
}

export async function bulkBacklog(projectId: string, input: BulkBacklogInput, actor: Actor): Promise<BulkBacklogResult> {
  const ids = [...new Set(input.ids)]
  switch (input.action) {
    case "status":
      return result("status", ids, await bulkStatus(projectId, ids, input.payload.status, actor))
    case "assignPo":
      return result("assignPo", ids, await bulkAssignPo(projectId, ids, input.payload.assignedPo, actor))
    case "trash":
      return result("trash", ids, await bulkTrash(projectId, ids, actor))
    case "linkPlan":
      return result("linkPlan", ids, await bulkLinkPlan(projectId, ids, input.payload.planItemId, actor))
    case "addToSprint": {
      const added = await addPbisToSprint(projectId, input.payload.sprintId, ids, actor)
      return result("addToSprint", ids, (added.items ?? []).map((i) => i.pbItemId))
    }
  }
}

/** One UPDATE for the changed rows + one "update" history row per PBI. */
async function updateRows(
  tx: Db,
  projectId: string,
  rows: readonly LiveRow[],
  data: Record<string, unknown>,
  actor: Actor
): Promise<void> {
  if (rows.length === 0) return
  await repo.updateBacklogItemsMany(tx, projectId, rows.map((r) => r.id), data)
  for (const row of rows) {
    await logUpdate(tx, {
      projectId,
      entityType: "pbi",
      entityId: row.id,
      actor,
      before: row,
      after: { ...row, ...data },
      meta: { displayId: row.displayId, bulk: true },
    })
  }
}

function bulkStatus(projectId: string, ids: readonly string[], status: PbiStatus, actor: Actor): Promise<string[]> {
  return withTransaction(async (tx) => {
    const rows = (await repo.findLiveBacklogItemsByIds(tx, projectId, ids)).filter((r) => r.status !== status)
    await updateRows(tx, projectId, rows, { status, ...completionPatch(status) }, actor)
    await recalcPlanItems(rows.map((r) => r.planItemId), tx)
    return rows.map((r) => r.id)
  })
}

function bulkAssignPo(projectId: string, ids: readonly string[], raw: string | null, actor: Actor): Promise<string[]> {
  const assignedPo = raw?.trim() ? raw.trim() : null
  return withTransaction(async (tx) => {
    const rows = (await repo.findLiveBacklogItemsByIds(tx, projectId, ids)).filter((r) => (r.assignedPo ?? null) !== assignedPo)
    await updateRows(tx, projectId, rows, { assignedPo }, actor)
    if (assignedPo) await notifyNewAssignees(tx, projectId, rows, assignedPo, actor)
    return rows.map((r) => r.id)
  })
}

/** "assigned" notifications per PBI; each distinct name is resolved to user ids once. */
async function notifyNewAssignees(tx: Db, projectId: string, rows: readonly LiveRow[], assignedPo: string, actor: Actor) {
  const cache = new Map<string, Promise<string[]>>()
  const resolve = (name: string | null) => {
    if (!name) return Promise.resolve<string[]>([])
    if (!cache.has(name)) cache.set(name, resolveAssigneeUserIds(tx, projectId, name))
    return cache.get(name) as Promise<string[]>
  }
  const next = await resolve(assignedPo)
  if (next.length === 0) return
  for (const row of rows) {
    const prev = await resolve(row.assignedPo)
    await notifyPbiAssigned(tx, projectId, row, next.filter((id) => !prev.includes(id)), actor)
  }
}

function bulkTrash(projectId: string, ids: readonly string[], actor: Actor): Promise<string[]> {
  return withTransaction(async (tx) => {
    const rows = await repo.findLiveBacklogItemsByIds(tx, projectId, ids)
    const liveIds = rows.map((r) => r.id)
    if (liveIds.length === 0) return []
    await repo.softDeleteBacklogItemsMany(tx, projectId, liveIds, actor.userId)
    await rescoreSprintsOf(tx, await repo.findTasksOfBacklogItems(tx, liveIds))
    await recalcPlanItems(rows.map((r) => r.planItemId), tx)
    for (const row of rows) {
      await logActivity(tx, {
        projectId,
        entityType: "pbi",
        entityId: row.id,
        action: "delete",
        actor,
        diff: { label: labelOf("pbi", row), meta: { trashed: true, bulk: true } },
      })
    }
    return liveIds
  })
}

/**
 * Link every PBI to one master-plan leaf (or unlink with null). The plan item
 * must be a live leaf of the project (404 PLAN_ITEM_NOT_FOUND / 400
 * PLAN_LINK_REQUIRES_LEAF, 400 PLAN_LINK_MILESTONE); the old and new plan items are recalculated.
 */
function bulkLinkPlan(projectId: string, ids: readonly string[], planItemId: string | null, actor: Actor): Promise<string[]> {
  return withTransaction(async (tx) => {
    if (planItemId) await assertLinkablePlanItem(tx, projectId, planItemId)
    const rows = (await repo.findLiveBacklogItemsByIds(tx, projectId, ids)).filter((r) => (r.planItemId ?? null) !== planItemId)
    await updateRows(tx, projectId, rows, { planItemId }, actor)
    await recalcPlanItems([planItemId, ...rows.map((r) => r.planItemId)], tx)
    return rows.map((r) => r.id)
  })
}
