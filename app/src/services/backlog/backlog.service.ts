import { recalcSprintActualScore } from "@/lib/sprint-score"
import type { Actor } from "@/services/_shared/actor"
import { loadSnapshot, logActivity, logCreate, logUpdate } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError, rethrowPrisma } from "@/services/_shared/errors"
import { newlyAssignedUserIds, notify } from "@/services/_shared/notifications"
import { assertProjectLive } from "@/services/_shared/soft-delete"
import { DISPLAY_ID_CONFLICT, retryOnUniqueViolation } from "@/services/_shared/unique-retry"
import { noteUnversionedWrite, staleOrMissing, takeVersion } from "@/services/_shared/versioning"
import { attachI18n, attachI18nOne, enqueueIn, getI18nFor, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./backlog.repository"
import type { CreateBacklogItemInput, ListBacklogQuery, UpdateBacklogItemInput } from "./backlog.schemas"

type Linked = { id: string; deletedAt?: Date | null } | null
interface LinkedRow {
  iceboxItem: Linked
  productGoal: Linked
}

/** Attach i18n to the nested icebox request / product goal the backlog UI renders inline. */
async function withLinkedI18n<T extends LinkedRow>(rows: readonly T[]) {
  const [iceboxI18n, goalI18n] = await Promise.all([
    getI18nFor("icebox_item", rows.map((i) => i.iceboxItem?.id ?? "").filter(Boolean)),
    getI18nFor("product_goal", rows.map((i) => i.productGoal?.id ?? "").filter(Boolean)),
  ])
  return rows.map((i) => ({
    ...i,
    // A trashed Icebox request is not shown as the PBI's source.
    iceboxItem: i.iceboxItem && !i.iceboxItem.deletedAt ? { ...i.iceboxItem, i18n: iceboxI18n.get(i.iceboxItem.id) ?? {} } : null,
    productGoal: i.productGoal ? { ...i.productGoal, i18n: goalI18n.get(i.productGoal.id) ?? {} } : null,
  }))
}

/**
 * Linked icebox request / product goal must belong to the same project (404
 * otherwise, like the other cross-project checks). Empty / null / undefined =
 * no link, nothing to verify.
 */
async function assertLinksInProject(
  db: Db,
  projectId: string,
  links: { iceboxItemId?: string | null; productGoalId?: string | null }
): Promise<void> {
  if (links.iceboxItemId && !(await repo.findProjectIceboxItemId(db, projectId, links.iceboxItemId))) {
    throw new NotFoundError("IceBox item not found", {}, "ICEBOX_ITEM_NOT_FOUND")
  }
  if (links.productGoalId && !(await repo.findProjectGoalId(db, projectId, links.productGoalId))) {
    throw new NotFoundError("Product goal not found", {}, "PRODUCT_GOAL_NOT_FOUND")
  }
}

/** `completedAt` follows status: set on "completed", cleared on any other explicit status. */
export function completionPatch(status: string | undefined): { completedAt?: Date | null } {
  if (status === "completed") return { completedAt: new Date() }
  return status ? { completedAt: null } : {}
}

/**
 * Backlog grouped by status. With `query.status` only that status is loaded
 * (the other groups come back empty) — same response shape either way.
 */
export async function listBacklog(projectId: string, query: ListBacklogQuery = {}) {
  const raw = await repo.findBacklogItems(defaultDb, projectId, query.status)
  const items = await withLinkedI18n(await attachI18n("backlog_item", raw))
  const readyItems = items.filter((i) => i.status === "ready")
  return {
    readyItems,
    notReadyItems: items.filter((i) => i.status === "not_ready"),
    completedItems: items.filter((i) => i.status === "completed"),
    totalWorkload: readyItems.reduce((sum, i) => sum + (i.workloadScore ?? 0), 0),
  }
}

const pbiNotFound = () => new NotFoundError("Not found", {}, "PBI_NOT_FOUND")

/** The GET /backlog/:id DTO of a loaded row. */
async function toDetailDto(item: NonNullable<Awaited<ReturnType<typeof repo.findBacklogItem>>>) {
  const [out] = await withLinkedI18n([await attachI18nOne("backlog_item", item)])
  return out
}

export async function getBacklogItem(projectId: string, itemId: string) {
  const item = await repo.findBacklogItem(defaultDb, projectId, itemId)
  if (!item) throw pbiNotFound()
  return toDetailDto(item)
}

/** Error for a versioned PBI write that matched nothing: 409 with the current DTO, or 404. */
async function pbiWriteMiss(tx: Db, projectId: string, itemId: string) {
  const current = await repo.findBacklogItem(tx, projectId, itemId)
  return staleOrMissing(current && (await toDetailDto(current)), pbiNotFound)
}

/**
 * displayId / sortOrder are max + 1 under a unique (projectId, displayId)
 * index: a concurrent create makes the insert fail with P2002, and the whole
 * transaction is retried with fresh numbers.
 */
export async function createBacklogItem(projectId: string, input: CreateBacklogItemInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  return retryOnUniqueViolation(() => insertBacklogItemTx(projectId, data, actor)).catch((err: unknown) =>
    rethrowPrisma(err, { conflict: DISPLAY_ID_CONFLICT })
  )
}

function insertBacklogItemTx(projectId: string, data: CreateBacklogItemInput, actor: Actor) {
  return withTransaction(async (tx) => {
    await assertLinksInProject(tx, projectId, data)
    const next = await repo.nextBacklogNumbers(tx, projectId)
    const item = await repo.insertBacklogItem(tx, {
      projectId,
      displayId: next.displayId,
      sortOrder: next.sortOrder,
      initiative: data.initiative,
      epic: data.epic,
      userStory: data.userStory,
      acceptanceCriteria: data.acceptanceCriteria,
      referenceDoc: data.referenceDoc,
      workloadScore: data.workloadScore ?? 0,
      status: data.status ?? "not_ready",
      iceboxItemId: data.iceboxItemId || null,
      productGoalId: data.productGoalId || null,
      assignedPo: data.assignedPo,
      poNote: data.poNote,
      notReadyReason: data.notReadyReason,
    })
    await enqueueIn(tx, "backlog_item", item.id, item)
    await logCreate(tx, { projectId, entityType: "pbi", entityId: item.id, actor, row: item, meta: { displayId: item.displayId } })
    await notifyPbiAssigned(tx, projectId, item, await newlyAssignedUserIds(tx, projectId, null, item.assignedPo), actor)
    return item
  })
}

interface AssignedPbi {
  id: string
  displayId: number
  userStory: string | null
}

/** "assigned" notification for the users newly set as the PBI's PO (same transaction). */
async function notifyPbiAssigned(tx: Db, projectId: string, item: AssignedPbi, userIds: readonly string[], actor: Actor) {
  if (userIds.length === 0) return
  await notify(tx, {
    recipientIds: userIds,
    actorId: actor.userId,
    type: "assigned",
    projectId,
    entityType: "pbi",
    entityId: item.id,
    payload: { entityLabel: item.userStory, displayId: item.displayId, actorName: actor.userName },
  })
}

/** `input.version` (optional) = the version the client loaded; stale → 409 VERSION_CONFLICT with `current`. */
export async function updateBacklogItem(projectId: string, itemId: string, input: UpdateBacklogItemInput, actor: Actor) {
  const { version, data: fields } = takeVersion(input)
  noteUnversionedWrite("pbi", itemId, version)
  const cleaned = await prepareText(fields, actor.userId)
  const data = cleaned.productGoalId === "" ? { ...cleaned, productGoalId: null } : cleaned
  const item = await withTransaction(async (tx) => {
    await assertLinksInProject(tx, projectId, data)
    const before = await loadSnapshot(tx, "pbi", itemId)
    const updated = await repo.updateBacklogItem(tx, projectId, itemId, { ...data, ...completionPatch(data.status) }, version)
    if (!updated) throw await pbiWriteMiss(tx, projectId, itemId)
    await enqueueIn(tx, "backlog_item", updated.id, data)
    const meta = { displayId: updated.displayId }
    const changes = await logUpdate(tx, { projectId, entityType: "pbi", entityId: itemId, actor, before, after: updated, meta })
    if (changes.assignedPo) {
      const userIds = await newlyAssignedUserIds(tx, projectId, before?.assignedPo as string | null | undefined, updated.assignedPo)
      await notifyPbiAssigned(tx, projectId, updated, userIds, actor)
    }
    return updated
  })
  return attachI18nOne("backlog_item", item)
}

/** Re-score every sprint holding tasks of the PBI (after it enters / leaves the trash or is purged). */
async function rescoreSprintsOf(tx: Db, tasks: ReadonlyArray<{ sprintId: string }>): Promise<void> {
  for (const sprintId of new Set(tasks.map((t) => t.sprintId))) {
    await recalcSprintActualScore(sprintId, tx)
  }
}

/**
 * Moves the PBI to the trash (restorable until purged, see purgeBacklogItem
 * and the purge-trash worker job). Its sprint tasks keep their rows but drop
 * out of every sprint view and score; translations are kept for a restore.
 */
export async function deleteBacklogItem(projectId: string, itemId: string, actor: Actor, version?: number): Promise<void> {
  noteUnversionedWrite("pbi", itemId, version)
  await withTransaction(async (tx) => {
    if (!(await repo.softDeleteBacklogItem(tx, projectId, itemId, actor.userId, version))) {
      throw version === undefined ? pbiNotFound() : await pbiWriteMiss(tx, projectId, itemId)
    }
    await rescoreSprintsOf(tx, await repo.findTasksOfBacklogItem(tx, itemId))
    await logActivity(tx, { projectId, entityType: "pbi", entityId: itemId, action: "delete", actor, diff: { meta: { trashed: true } } })
  })
}

/** Items not in the project are ignored (updateMany scoped by projectId). */
export async function reorderBacklog(projectId: string, orderedIds: readonly string[], actor: Actor | null = null): Promise<void> {
  await withTransaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await repo.setBacklogSortOrder(tx, projectId, id, index)
    }
    // One project-level row per reorder (per-PBI rows would flood the feed).
    await logActivity(tx, {
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "move",
      actor,
      diff: { changes: { backlogOrder: { changed: true } }, meta: { count: orderedIds.length } },
    })
  })
}

// === trash: restore / purge ===

/**
 * Takes a trashed PBI out of the trash (same displayId and translations). Its
 * sprint tasks reappear and the sprints are re-scored. 404 when the PBI is
 * not in the trash; 409 PROJECT_IN_TRASH while its project is trashed.
 */
export async function restoreBacklogItem(projectId: string, itemId: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    if (!(await repo.findTrashedBacklogItem(tx, projectId, itemId))) throw new NotFoundError("Not found", {}, "PBI_NOT_FOUND")
    await assertProjectLive(tx, projectId)
    await repo.restoreBacklogItemRow(tx, projectId, itemId)
    await rescoreSprintsOf(tx, await repo.findTasksOfBacklogItem(tx, itemId))
    await logActivity(tx, { projectId, entityType: "pbi", entityId: itemId, action: "restore", actor })
  })
}

/**
 * Permanently deletes a trashed PBI; its sprint tasks cascade in the DB. In
 * the same transaction: purge the translations of the PBI and of those tasks
 * and re-score the sprints. Release items keep existing (pbItemId → NULL) with
 * their own translations. `actor` null = the purge-trash worker job.
 */
export async function purgeBacklogItem(projectId: string, itemId: string, actor: Actor | null): Promise<void> {
  await withTransaction(async (tx) => {
    if (!(await repo.findTrashedBacklogItem(tx, projectId, itemId))) throw new NotFoundError("Not found", {}, "PBI_NOT_FOUND")
    const tasks = await repo.findTasksOfBacklogItem(tx, itemId)
    await repo.deleteBacklogItem(tx, projectId, itemId)
    await purgeIn(tx, { backlog_item: [itemId], sprint_task: tasks.map((t) => t.id) })
    await rescoreSprintsOf(tx, tasks)
    await logActivity(tx, { projectId, entityType: "pbi", entityId: itemId, action: "delete", actor, diff: { meta: { purged: true } } })
  })
}
