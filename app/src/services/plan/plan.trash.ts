/**
 * Plan items in the project trash. DELETE /plan/:id trashes an item with its
 * live subtree under ONE deletedAt (a "batch"); the trash lists batch roots,
 * restore brings the whole batch back and purge hard-deletes the root (the
 * subtree and dependencies cascade in the DB; linked PBIs are unlinked).
 */
import { recalcPlanProgress } from "@/lib/plan-progress"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { assertProjectLive } from "@/services/_shared/soft-delete"
import { collectSubtreeIds } from "@/services/_shared/tree"
import { purgeIn } from "@/services/_shared/translations"
import * as repo from "./plan.repository"
import { collectTrashBatch, planItemNotFound } from "./plan.rules"

export interface TrashedPlanRoot {
  id: string
  name: string
  status: string
  deletedAt: Date | null
  deletedById: string | null
  /** Items trashed together with it (itself included). */
  subtreeCount: number
}

type TrashedRow = Awaited<ReturnType<typeof repo.findTrashedPlanItems>>[number]

/** Pure: batch roots (parent live or trashed at another time) with the size of their batch. */
export function trashRoots(rows: readonly TrashedRow[]): TrashedPlanRoot[] {
  const stamp = (d: Date | null | undefined) => d?.getTime() ?? null
  const inSameBatch = (r: TrashedRow) => r.parentId !== null && r.parent !== null && stamp(r.parent.deletedAt) === stamp(r.deletedAt)
  const flat = rows.map((r) => ({ id: r.id, parentId: r.parentId, deletedAt: r.deletedAt }))
  return rows
    .filter((r) => !inSameBatch(r))
    .map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      deletedAt: r.deletedAt,
      deletedById: r.deletedById,
      subtreeCount: collectTrashBatch(flat, r.id).length,
    }))
}

export async function listTrashedPlanRoots(projectId: string): Promise<TrashedPlanRoot[]> {
  return trashRoots(await repo.findTrashedPlanItems(defaultDb, projectId))
}

/**
 * Take a trashed batch out of the trash. When the root's parent is still in
 * the trash (trashed separately), the root is restored at the top level.
 * 404 when the item is not a trashed plan item of the project; 409
 * PROJECT_IN_TRASH while the project is trashed.
 */
export async function restorePlanItem(projectId: string, itemId: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    const row = await repo.findTrashedPlanItem(tx, projectId, itemId)
    if (!row) throw planItemNotFound()
    await assertProjectLive(tx, projectId)
    const all = await repo.findPlanTreeWithTrash(tx, projectId)
    const batch = collectTrashBatch(all, itemId)
    const parent = row.parentId ? all.find((r) => r.id === row.parentId) : undefined
    const movedToRoot = !!row.parentId && (!parent || parent.deletedAt !== null)
    await repo.restorePlanItems(tx, projectId, batch)
    if (movedToRoot) await repo.updatePlanItem(tx, itemId, { parentId: null })
    await recalcPlanProgress(projectId, [itemId, movedToRoot ? null : row.parentId], tx)
    await logActivity(tx, {
      projectId,
      entityType: "plan_item",
      entityId: itemId,
      action: "restore",
      actor,
      diff: { label: row.name, meta: { subtreeCount: batch.length, ...(movedToRoot && { movedToRoot: true }) } },
    })
  })
}

/**
 * Permanently delete a trashed plan item and everything under it (the FK
 * cascade), with the translations of that subtree. `actor` null = the
 * purge-trash worker job.
 */
export async function purgePlanItem(projectId: string, itemId: string, actor: Actor | null): Promise<void> {
  await withTransaction(async (tx) => {
    const row = await repo.findTrashedPlanItem(tx, projectId, itemId)
    if (!row) throw planItemNotFound()
    const subtree = collectSubtreeIds(await repo.findPlanTreeWithTrash(tx, projectId), itemId)
    await repo.deletePlanItemHard(tx, projectId, itemId)
    await purgeIn(tx, { plan_item: subtree })
    await logActivity(tx, {
      projectId,
      entityType: "plan_item",
      entityId: itemId,
      action: "delete",
      actor,
      diff: { label: row.name, meta: { purged: true, subtreeCount: subtree.length } },
    })
  })
}
