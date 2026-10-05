import { IMPROVEMENT_MAX_ROLLOUTS } from "@/lib/improvement/constants"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import * as children from "./improvements.children.repository"
import * as repo from "./improvements.repository"
import type { CreateRolloutInput, ReorderRolloutsInput, UpdateRolloutInput } from "./improvements.schemas"

/**
 * 横展開先 (rollout targets: other lines / plants the kaizen is copied to).
 * Targets are free text; the board suggests names used before in the project.
 * Status todo → doing → done; doneAt is stamped when it becomes done.
 */

const notFound = () => new NotFoundError("Not found")

function logRolloutChange(tx: Db, projectId: string, itemId: string, change: { from: string | null; to: string | null }, actor: Actor | null) {
  return logActivity(tx, { projectId, entityType: "release", entityId: itemId, action: "update", actor, diff: { changes: { rollout: change } } })
}

export async function addRollout(projectId: string, itemId: string, input: CreateRolloutInput, actor: Actor | null = null) {
  return withTransaction(async (tx) => {
    if (!(await repo.findItemState(tx, projectId, itemId))) throw notFound()
    const count = await children.countRollouts(tx, itemId)
    if (count >= IMPROVEMENT_MAX_ROLLOUTS) throw new ValidationError("横展開先が多すぎます", {}, "IMPROVEMENT_TOO_MANY_ROLLOUTS")
    const rollout = await children.insertRollout(tx, { releaseItemId: itemId, targetName: input.targetName, sortOrder: count })
    await logRolloutChange(tx, projectId, itemId, { from: null, to: input.targetName }, actor)
    return rollout
  })
}

/** Status changes: any member (the floor reports progress); renames are checked by the route. */
export async function updateRollout(projectId: string, itemId: string, rolloutId: string, input: UpdateRolloutInput, actor: Actor | null = null) {
  return withTransaction(async (tx) => {
    const before = await children.findRollout(tx, projectId, itemId, rolloutId)
    if (!before) throw notFound()
    const statusChanged = input.status !== undefined && input.status !== before.status
    const rollout = await children.updateRollout(tx, rolloutId, {
      ...(input.targetName !== undefined ? { targetName: input.targetName } : {}),
      ...(statusChanged ? { status: input.status, doneAt: input.status === "done" ? new Date() : null } : {}),
    })
    const label = `${rollout.targetName}: ${rollout.status}`
    await logRolloutChange(tx, projectId, itemId, { from: `${before.targetName}: ${before.status}`, to: label }, actor)
    return rollout
  })
}

export async function removeRollout(projectId: string, itemId: string, rolloutId: string, actor: Actor | null = null): Promise<void> {
  await withTransaction(async (tx) => {
    const rollout = await children.findRollout(tx, projectId, itemId, rolloutId)
    if (!rollout) throw notFound()
    await children.deleteRollout(tx, rolloutId)
    await logRolloutChange(tx, projectId, itemId, { from: rollout.targetName, to: null }, actor)
  })
}

/** Persist a new order; `orderedIds` must be exactly the item's rollout ids. */
export async function reorderRollouts(projectId: string, itemId: string, input: ReorderRolloutsInput) {
  return withTransaction(async (tx) => {
    if (!(await repo.findItemState(tx, projectId, itemId))) throw notFound()
    const current = await children.findRollouts(tx, itemId)
    const known = new Set(current.map((r) => r.id))
    const sameSet = input.orderedIds.length === known.size && new Set(input.orderedIds).size === known.size && input.orderedIds.every((id) => known.has(id))
    if (!sameSet) throw new ValidationError("並び順が現在の横展開先と一致しません")
    for (const [index, id] of input.orderedIds.entries()) {
      await children.updateRollout(tx, id, { sortOrder: index })
    }
    return children.findRollouts(tx, itemId)
  })
}
