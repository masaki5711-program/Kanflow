import type { Prisma } from "@/generated/prisma/client"
import { recalcPlanProgress, statusToProgress } from "@/lib/plan-progress"
import type { Actor } from "@/services/_shared/actor"
import { loadSnapshot, logActivity, logCreate, logDelete, logUpdate } from "@/services/_shared/activity"
import { optionalDate, parseDateOrThrow } from "@/services/_shared/dates"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import { collectSubtreeIds, wouldCreateCycle, type TreeNode } from "@/services/_shared/tree"
import { attachI18n, attachI18nOne, enqueueIn, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./plan.repository"
import type { CreatePlanItemInput, PlanReorderUpdate, UpdatePlanItemInput } from "./plan.schemas"

const PARENT_MISSING = "親項目が見つかりません"

export async function listPlan(projectId: string) {
  return attachI18n("plan_item", await repo.findPlanItems(defaultDb, projectId))
}

export async function createPlanItem(projectId: string, input: CreatePlanItemInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const plannedStart = parseDateOrThrow(data.plannedStart)
  const plannedEnd = parseDateOrThrow(data.plannedEnd)
  const parentId = data.parentId ?? null
  return withTransaction(async (tx) => {
    if (parentId && !(await repo.findPlanItem(tx, projectId, parentId))) {
      throw new ValidationError(PARENT_MISSING, {}, "PLAN_PARENT_NOT_FOUND")
    }
    const status = data.status ?? "not_started"
    const item = await repo.insertPlanItem(tx, {
      projectId,
      parentId,
      name: data.name,
      description: data.description ?? null,
      plannedStart,
      plannedEnd,
      isMilestone: data.isMilestone ?? false,
      color: data.color ?? null,
      status,
      progressPct: statusToProgress(status),
      sortOrder: await repo.nextPlanSortOrder(tx, projectId, parentId),
    })
    if (item.parentId) await recalcPlanProgress(projectId, [item.parentId], tx)
    await enqueueIn(tx, "plan_item", item.id, item)
    await logCreate(tx, { projectId, entityType: "plan_item", entityId: item.id, actor, row: item })
    return item
  })
}

/** Pure: the Prisma update payload for a PATCH (only the provided fields). */
export function buildPlanUpdate(data: UpdatePlanItemInput): Prisma.PlanItemUncheckedUpdateInput {
  return {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.parentId !== undefined && { parentId: data.parentId }),
    ...(data.plannedStart ? { plannedStart: new Date(data.plannedStart) } : {}),
    ...(data.plannedEnd ? { plannedEnd: new Date(data.plannedEnd) } : {}),
    ...(data.actualStart !== undefined && { actualStart: optionalDate(data.actualStart) }),
    ...(data.actualEnd !== undefined && { actualEnd: optionalDate(data.actualEnd) }),
    ...(data.isMilestone !== undefined && { isMilestone: data.isMilestone }),
    ...(data.color !== undefined && { color: data.color }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
  }
}

/** Reparent guard: parent in the same project, not itself, not a descendant. */
async function assertValidParent(tx: Db, projectId: string, itemId: string, parentId: string): Promise<void> {
  if (parentId === itemId) throw new ValidationError("自分自身を親にできません", {}, "PLAN_SELF_PARENT")
  const tree = await repo.findPlanTree(tx, projectId)
  if (!tree.some((n) => n.id === parentId)) throw new ValidationError(PARENT_MISSING, {}, "PLAN_PARENT_NOT_FOUND")
  if (wouldCreateCycle(tree, itemId, parentId)) throw new ValidationError("循環参照になります", {}, "PLAN_CYCLE")
}

export async function updatePlanItem(projectId: string, itemId: string, input: UpdatePlanItemInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const updated = await withTransaction(async (tx) => {
    const existing = await repo.findPlanItem(tx, projectId, itemId)
    if (!existing) throw new NotFoundError()
    if (data.parentId) await assertValidParent(tx, projectId, itemId, data.parentId)
    const before = await loadSnapshot(tx, "plan_item", itemId)
    const row = await repo.updatePlanItem(tx, itemId, buildPlanUpdate(data))
    // A leaf's progress is derived from its status; parents are recomputed below.
    if (data.status !== undefined && (await repo.countPlanChildren(tx, itemId)) === 0) {
      await repo.updatePlanItem(tx, itemId, { progressPct: statusToProgress(data.status) })
    }
    // Rebalance both the old and the new ancestor chain.
    const starts = [itemId, existing.parentId, data.parentId].filter((id): id is string => !!id)
    await recalcPlanProgress(projectId, starts, tx)
    await enqueueIn(tx, "plan_item", row.id, data)
    await logUpdate(tx, { projectId, entityType: "plan_item", entityId: itemId, actor, before, after: row })
    return row
  })
  return attachI18nOne("plan_item", updated)
}

/** Deletes the row and (FK cascade) its whole subtree, with every translation of that subtree. */
export async function deletePlanItem(projectId: string, itemId: string, actor: Actor | null = null): Promise<void> {
  await withTransaction(async (tx) => {
    const existing = await repo.findPlanItem(tx, projectId, itemId)
    if (!existing) throw new NotFoundError()
    const subtree = collectSubtreeIds(await repo.findPlanTree(tx, projectId), itemId)
    const row = await loadSnapshot(tx, "plan_item", itemId)
    await repo.deletePlanItem(tx, itemId)
    await logDelete(tx, { projectId, entityType: "plan_item", entityId: itemId, actor, row, meta: { subtreeCount: subtree.length } })
    await purgeIn(tx, { plan_item: subtree })
    if (existing.parentId) await recalcPlanProgress(projectId, [existing.parentId], tx)
  })
}

/**
 * Pure: every non-null target parent is a plan item of the same project, no
 * item becomes its own parent, and the tree after applying ALL updates is
 * acyclic (a batch can swap parents, so each update is checked against the
 * final state, not the current one).
 */
export function assertValidReorder(tree: readonly TreeNode[], updates: readonly PlanReorderUpdate[]): void {
  const ids = new Set(tree.map((n) => n.id))
  for (const u of updates) {
    if (u.parentId === null) continue
    if (u.parentId === u.id) throw new ValidationError("自分自身を親にできません", {}, "PLAN_SELF_PARENT")
    if (!ids.has(u.parentId)) throw new ValidationError(PARENT_MISSING, {}, "PLAN_PARENT_NOT_FOUND")
  }
  const nextParent = new Map(updates.map((u) => [u.id, u.parentId]))
  const finalTree = tree.map((n) => (nextParent.has(n.id) ? { id: n.id, parentId: nextParent.get(n.id) ?? null } : n))
  for (const u of updates) {
    if (u.parentId && wouldCreateCycle(finalTree, u.id, u.parentId)) {
      throw new ValidationError("循環参照になります", {}, "PLAN_CYCLE")
    }
  }
}

/**
 * Activity of a reorder: one "move" per reparented item; a pure sort-order
 * change is one project-level row (per-item rows would flood the feed).
 */
async function logPlanMoves(
  tx: Db,
  projectId: string,
  existing: ReadonlyArray<{ id: string; parentId: string | null }>,
  updates: readonly PlanReorderUpdate[],
  actor: Actor | null
): Promise<void> {
  const parentOf = new Map(existing.map((e) => [e.id, e.parentId]))
  const moved = updates.filter((u) => (parentOf.get(u.id) ?? null) !== u.parentId)
  for (const u of moved) {
    await logActivity(tx, {
      projectId,
      entityType: "plan_item",
      entityId: u.id,
      action: "move",
      actor,
      diff: { changes: { parentId: { from: parentOf.get(u.id) ?? null, to: u.parentId } } },
    })
  }
  if (moved.length > 0) return
  await logActivity(tx, {
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "move",
    actor,
    diff: { changes: { planOrder: { changed: true } }, meta: { count: updates.length } },
  })
}

/** Bulk reparent / reorder (drag & drop). Every id and parent must belong to the project. */
export async function reorderPlan(projectId: string, updates: readonly PlanReorderUpdate[], actor: Actor | null = null): Promise<void> {
  await withTransaction(async (tx) => {
    const existing = await repo.findPlanItemsByIds(tx, projectId, updates.map((u) => u.id))
    if (existing.length !== updates.length) throw new ValidationError("対象の項目が見つかりません", {}, "PLAN_ITEM_NOT_FOUND")
    assertValidReorder(await repo.findPlanTree(tx, projectId), updates)
    for (const u of updates) {
      await repo.updatePlanItem(tx, u.id, { parentId: u.parentId, sortOrder: u.sortOrder })
    }
    const affected = new Set<string>()
    for (const e of existing) if (e.parentId) affected.add(e.parentId)
    for (const u of updates) if (u.parentId) affected.add(u.parentId)
    if (affected.size > 0) await recalcPlanProgress(projectId, Array.from(affected), tx)
    await logPlanMoves(tx, projectId, existing, updates, actor)
  })
}
