import { recalcPlanItems } from "@/lib/plan-progress"
import { recalcSprintActualScore } from "@/lib/sprint-score"
import type { Actor } from "@/services/_shared/actor"
import { loadSnapshot, logActivity, logCreate, logUpdate } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError, ValidationError, rethrowPrisma } from "@/services/_shared/errors"
import { newlyAssignedUserIds, notify } from "@/services/_shared/notifications"
import { assertProjectLive } from "@/services/_shared/soft-delete"
import { DISPLAY_ID_CONFLICT, retryOnUniqueViolation } from "@/services/_shared/unique-retry"
import { noteUnversionedWrite, staleOrMissing, takeVersion } from "@/services/_shared/versioning"
import { attachI18n, attachI18nOne, enqueueIn, getI18nFor, prepareText, purgeIn } from "@/services/_shared/translations"
import { assertLinkablePlanItem } from "@/services/plan/plan.links"
import { loadDependencies, withDependencies } from "./backlog.dependencies"
import * as repo from "./backlog.repository"
import { PBI_CONTENT_REQUIRED_MESSAGE, hasPbiContent, type CreateBacklogItemInput, type ListBacklogQuery, type UpdateBacklogItemInput } from "./backlog.schemas"

type Linked = { id: string; deletedAt?: Date | null } | null
interface LinkedRow {
  iceboxItem: Linked
  productGoal: Linked
  planItem?: { id: string; name: string; deletedAt: Date | null } | null
  sprintItems?: { sprint: { id: string } }[]
}

/** The PBI's plan item as the DTO shows it: `{ id, name }`, null when unlinked or in the trash. */
export function planItemRef(p: LinkedRow["planItem"]): { id: string; name: string } | null {
  return p && p.deletedAt === null ? { id: p.id, name: p.name } : null
}

/** Attach i18n to the nested icebox request / product goal the backlog UI renders inline. */
async function withLinkedI18n<T extends LinkedRow>(rows: readonly T[]) {
  const [iceboxI18n, goalI18n, sprintI18n] = await Promise.all([
    getI18nFor("icebox_item", rows.map((i) => i.iceboxItem?.id ?? "").filter(Boolean)),
    getI18nFor("product_goal", rows.map((i) => i.productGoal?.id ?? "").filter(Boolean)),
    getI18nFor("sprint", [...new Set(rows.flatMap((i) => (i.sprintItems ?? []).map((si) => si.sprint.id)))]),
  ])
  return rows.map((i) => ({
    ...i,
    // The card's "in sprint" chip shows the sprint name in the viewer's language.
    ...(i.sprintItems ? { sprintItems: i.sprintItems.map((si) => ({ ...si, sprint: { ...si.sprint, i18n: sprintI18n.get(si.sprint.id) ?? {} } })) } : {}),
    // A trashed Icebox request is not shown as the PBI's source.
    iceboxItem: i.iceboxItem && !i.iceboxItem.deletedAt ? { ...i.iceboxItem, i18n: iceboxI18n.get(i.iceboxItem.id) ?? {} } : null,
    productGoal: i.productGoal ? { ...i.productGoal, i18n: goalI18n.get(i.productGoal.id) ?? {} } : null,
    planItem: planItemRef(i.planItem),
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
  links: { iceboxItemId?: string | null; productGoalId?: string | null; planItemId?: string | null }
): Promise<void> {
  if (links.iceboxItemId && !(await repo.findProjectIceboxItemId(db, projectId, links.iceboxItemId))) {
    throw new NotFoundError("IceBox item not found", {}, "ICEBOX_ITEM_NOT_FOUND")
  }
  if (links.productGoalId && !(await repo.findProjectGoalId(db, projectId, links.productGoalId))) {
    throw new NotFoundError("Product goal not found", {}, "PRODUCT_GOAL_NOT_FOUND")
  }
  if (links.planItemId) await assertLinkablePlanItem(db, projectId, links.planItemId)
}

/** `completedAt` follows status: set on "completed", cleared on any other explicit status. */
export function completionPatch(status: string | undefined): { completedAt?: Date | null } {
  if (status === "completed") return { completedAt: new Date() }
  return status ? { completedAt: null } : {}
}

/**
 * Backlog grouped by status. With `query.status` only that status is loaded
 * (the other groups come back empty) and `query.planItemId` keeps only the
 * PBIs linked to that plan item — same response shape either way.
 */
export async function listBacklog(projectId: string, query: ListBacklogQuery = {}) {
  const [raw, deps] = await Promise.all([
    repo.findBacklogItems(defaultDb, projectId, query.status, query.planItemId),
    loadDependencies(defaultDb, projectId),
  ])
  const items = withDependencies(await withLinkedI18n(await attachI18n("backlog_item", raw)), deps)
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

/** The detail DTO plus the PBI's dependencies (`blockedBy` / `blocking`). */
export async function getBacklogItem(projectId: string, itemId: string) {
  const item = await repo.findBacklogItem(defaultDb, projectId, itemId)
  if (!item) throw pbiNotFound()
  const [dto, deps] = await Promise.all([toDetailDto(item), loadDependencies(defaultDb, projectId, itemId)])
  return withDependencies([dto], deps)[0]
}

/** Error for a versioned PBI write that matched nothing: 409 with the current DTO, or 404. */
async function pbiWriteMiss(tx: Db, projectId: string, itemId: string) {
  const current = await repo.findBacklogItem(tx, projectId, itemId)
  return staleOrMissing(current && (await toDetailDto(current)), pbiNotFound)
}

/**
 * displayId / sortOrder are max + 1 under a unique (projectId, displayId)
 * index: a concurrent create makes the insert fail with P2002, and the whole
 * transaction is retried with fresh numbers. A PBI without an initiative and
 * a user story is refused (400 PBI_CONTENT_REQUIRED) — it would be untitled.
 */
export async function createBacklogItem(projectId: string, input: CreateBacklogItemInput, actor: Actor) {
  if (!hasPbiContent(input)) throw new ValidationError(PBI_CONTENT_REQUIRED_MESSAGE, {}, "PBI_CONTENT_REQUIRED")
  const data = await prepareText(input, actor.userId)
  return retryOnUniqueViolation(() => insertBacklogItemTx(projectId, data, actor)).catch((err: unknown) =>
    rethrowPrisma(err, { conflict: DISPLAY_ID_CONFLICT })
  )
}

function insertBacklogItemTx(projectId: string, data: CreateBacklogItemInput, actor: Actor) {
  return withTransaction((tx) => insertBacklogItemIn(tx, projectId, data, actor))
}

/**
 * The create body inside the caller's transaction (the Excel import runs many
 * in one). `data` must already have gone through `prepareText`.
 */
export async function insertBacklogItemIn(tx: Db, projectId: string, data: CreateBacklogItemInput, actor: Actor) {
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
}

interface AssignedPbi {
  id: string
  displayId: number
  initiative?: string | null
  userStory: string | null
}

/**
 * "#12 <title>" — how notifications name a PBI (title = the initiative the
 * backlog list shows, else the user story; first line only). Same format as
 * the comment / mention notifications.
 */
export function pbiNotificationLabel(item: Pick<AssignedPbi, "displayId" | "initiative" | "userStory">): string {
  const head = (item.initiative?.trim() || item.userStory?.trim() || "").split(/\r?\n/, 1)[0].trim()
  return head ? `#${item.displayId} ${head}` : `#${item.displayId}`
}

/** "assigned" notification for the users newly set as the PBI's PO (same transaction). */
export async function notifyPbiAssigned(tx: Db, projectId: string, item: AssignedPbi, userIds: readonly string[], actor: Actor) {
  if (userIds.length === 0) return
  await notify(tx, {
    recipientIds: userIds,
    actorId: actor.userId,
    type: "assigned",
    projectId,
    entityType: "pbi",
    entityId: item.id,
    payload: { entityLabel: pbiNotificationLabel(item), displayId: item.displayId, actorName: actor.userName },
  })
}

/** "" for a link field means "unlink" (stored as NULL); other values pass through (new object). */
export function emptyLinksToNull<T extends { productGoalId?: string | null; iceboxItemId?: string | null; planItemId?: string | null }>(data: T): T {
  return {
    ...data,
    ...(data.productGoalId === "" ? { productGoalId: null } : {}),
    ...(data.iceboxItemId === "" ? { iceboxItemId: null } : {}),
    ...(data.planItemId === "" ? { planItemId: null } : {}),
  }
}

/** A PBI write that can change plan progress (link, status or points). */
export function touchesPlan(data: { planItemId?: unknown; status?: unknown; workloadScore?: unknown }): boolean {
  return data.planItemId !== undefined || data.status !== undefined || data.workloadScore !== undefined
}

/** A PBI write that sets the title text (initiative or user story). */
export function touchesPbiContent(data: { initiative?: unknown; userStory?: unknown }): boolean {
  return data.initiative !== undefined || data.userStory !== undefined
}

/** `input.version` (optional) = the version the client loaded; stale → 409 VERSION_CONFLICT with `current`. */
export async function updateBacklogItem(projectId: string, itemId: string, input: UpdateBacklogItemInput, actor: Actor) {
  const { version, data: fields } = takeVersion(input)
  noteUnversionedWrite("pbi", itemId, version)
  const cleaned = await prepareText(fields, actor.userId)
  const data = emptyLinksToNull(cleaned)
  const item = await withTransaction((tx) => updateBacklogItemIn(tx, projectId, itemId, data, actor, version))
  return attachI18nOne("backlog_item", item)
}

/**
 * The update body inside the caller's transaction (the Excel import runs many
 * in one). `data` must already have gone through `prepareText` + `emptyLinksToNull`.
 */
export async function updateBacklogItemIn(
  tx: Db,
  projectId: string,
  itemId: string,
  data: Omit<UpdateBacklogItemInput, "version">,
  actor: Actor,
  version?: number
) {
  await assertLinksInProject(tx, projectId, data)
  const before = await loadSnapshot(tx, "pbi", itemId)
  const prevPlanItemId = touchesPlan(data) ? await repo.findPbiPlanItemId(tx, projectId, itemId) : null
  const updated = await repo.updateBacklogItem(tx, projectId, itemId, { ...data, ...completionPatch(data.status) }, version)
  if (!updated) throw await pbiWriteMiss(tx, projectId, itemId)
  // Same rule as create (N-01): the resulting row must keep an initiative or a user story.
  // Thrown inside the transaction, so the write is rolled back.
  if (touchesPbiContent(data) && !hasPbiContent(updated)) {
    throw new ValidationError(PBI_CONTENT_REQUIRED_MESSAGE, {}, "PBI_CONTENT_REQUIRED")
  }
  // Plan progress follows the PBI (old and new plan item when the link moved).
  if (touchesPlan(data)) await recalcPlanItems([prevPlanItemId, updated.planItemId], tx)
  await enqueueIn(tx, "backlog_item", updated.id, data)
  const meta = { displayId: updated.displayId }
  const changes = await logUpdate(tx, { projectId, entityType: "pbi", entityId: itemId, actor, before, after: updated, meta })
  if (changes.assignedPo) {
    const userIds = await newlyAssignedUserIds(tx, projectId, before?.assignedPo as string | null | undefined, updated.assignedPo)
    await notifyPbiAssigned(tx, projectId, updated, userIds, actor)
  }
  return updated
}

/** Re-score every sprint holding tasks of the PBI (after it enters / leaves the trash or is purged). */
export async function rescoreSprintsOf(tx: Db, tasks: ReadonlyArray<{ sprintId: string }>): Promise<void> {
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
    await recalcPlanItems([await repo.findPbiPlanItemId(tx, projectId, itemId)], tx)
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
    await recalcPlanItems([await repo.findPbiPlanItemId(tx, projectId, itemId)], tx)
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
    const planItemId = await repo.findPbiPlanItemId(tx, projectId, itemId)
    await repo.deleteBacklogItem(tx, projectId, itemId)
    await purgeIn(tx, { backlog_item: [itemId], sprint_task: tasks.map((t) => t.id) })
    await rescoreSprintsOf(tx, tasks)
    await recalcPlanItems([planItemId], tx)
    await logActivity(tx, { projectId, entityType: "pbi", entityId: itemId, action: "delete", actor, diff: { meta: { purged: true } } })
  })
}
