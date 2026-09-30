import { recalcSprintActualScore } from "@/lib/sprint-score"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { attachI18n, attachI18nOne, enqueueIn, getI18nFor, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./backlog.repository"
import type { CreateBacklogItemInput, UpdateBacklogItemInput } from "./backlog.schemas"

type Linked = { id: string } | null
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
    iceboxItem: i.iceboxItem ? { ...i.iceboxItem, i18n: iceboxI18n.get(i.iceboxItem.id) ?? {} } : null,
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

export async function listBacklog(projectId: string) {
  const raw = await repo.findBacklogItems(defaultDb, projectId)
  const items = await withLinkedI18n(await attachI18n("backlog_item", raw))
  const readyItems = items.filter((i) => i.status === "ready")
  return {
    readyItems,
    notReadyItems: items.filter((i) => i.status === "not_ready"),
    completedItems: items.filter((i) => i.status === "completed"),
    totalWorkload: readyItems.reduce((sum, i) => sum + (i.workloadScore ?? 0), 0),
  }
}

export async function getBacklogItem(projectId: string, itemId: string) {
  const item = await repo.findBacklogItem(defaultDb, projectId, itemId)
  if (!item) throw new NotFoundError("Not found", {}, "PBI_NOT_FOUND")
  const [out] = await withLinkedI18n([await attachI18nOne("backlog_item", item)])
  return out
}

export async function createBacklogItem(projectId: string, input: CreateBacklogItemInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
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
    return item
  })
}

export async function updateBacklogItem(projectId: string, itemId: string, input: UpdateBacklogItemInput, actor: Actor) {
  const cleaned = await prepareText(input, actor.userId)
  const data = cleaned.productGoalId === "" ? { ...cleaned, productGoalId: null } : cleaned
  const item = await withTransaction(async (tx) => {
    await assertLinksInProject(tx, projectId, data)
    const updated = await repo.updateBacklogItem(tx, projectId, itemId, { ...data, ...completionPatch(data.status) })
    await enqueueIn(tx, "backlog_item", updated.id, data)
    return updated
  })
  return attachI18nOne("backlog_item", item)
}

/**
 * Deletes the PBI; its sprint tasks cascade in the DB. In the same
 * transaction: purge the translations of the PBI and of those tasks, and
 * re-score the sprints that lost tasks. Release items keep existing
 * (pbItemId → NULL) and keep their own translations.
 */
export async function deleteBacklogItem(projectId: string, itemId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const tasks = await repo.findTasksOfBacklogItem(tx, itemId)
    await repo.deleteBacklogItem(tx, projectId, itemId)
    await purgeIn(tx, { backlog_item: [itemId], sprint_task: tasks.map((t) => t.id) })
    for (const sprintId of new Set(tasks.map((t) => t.sprintId))) {
      await recalcSprintActualScore(sprintId, tx)
    }
  })
}

/** Items not in the project are ignored (updateMany scoped by projectId). */
export async function reorderBacklog(projectId: string, orderedIds: readonly string[]): Promise<void> {
  await withTransaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await repo.setBacklogSortOrder(tx, projectId, id, index)
    }
  })
}
