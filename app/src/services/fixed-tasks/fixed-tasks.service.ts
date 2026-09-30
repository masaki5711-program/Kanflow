import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { attachI18n, enqueueIn, getI18nFor, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./fixed-tasks.repository"
import type { CreateFixedTaskInput, UpdateFixedTaskInput } from "./fixed-tasks.schemas"

/**
 * A user's reusable task groups ("設備購入" → concrete sub-tasks) offered in
 * the sprint task form. Every call is scoped to the caller's own groups.
 */
export async function listGroups(userId: string) {
  const groups = await repo.findGroups(defaultDb, userId)
  const [withI18n, itemI18n] = await Promise.all([
    attachI18n("fixed_task", groups),
    getI18nFor("fixed_task_item", groups.flatMap((t) => t.items.map((i) => i.id))),
  ])
  return withI18n.map((t) => ({ ...t, items: t.items.map((i) => ({ ...i, i18n: itemI18n.get(i.id) ?? {} })) }))
}

export async function createGroup(userId: string, input: CreateFixedTaskInput) {
  const data = await prepareText(input, userId)
  return withTransaction(async (tx) => {
    const sortOrder = await repo.nextGroupSortOrder(tx, userId)
    const group = await repo.insertGroup(tx, { userId, taskName: data.taskName, sortOrder })
    await enqueueIn(tx, "fixed_task", group.id, group)
    return group
  })
}

export async function updateGroup(userId: string, groupId: string, input: UpdateFixedTaskInput) {
  const data = await prepareText(input, userId)
  return withTransaction(async (tx) => {
    if (!(await repo.findOwnedGroup(tx, userId, groupId))) throw new NotFoundError()
    const group = await repo.updateGroup(tx, groupId, data)
    await enqueueIn(tx, "fixed_task", group.id, data)
    return group
  })
}

/** Items cascade; their translations are purged too. */
export async function deleteGroup(userId: string, groupId: string): Promise<void> {
  await withTransaction(async (tx) => {
    if (!(await repo.findOwnedGroup(tx, userId, groupId))) throw new NotFoundError()
    const items = await repo.findItemIdsOfGroup(tx, groupId)
    await repo.deleteGroup(tx, groupId)
    await purgeIn(tx, { fixed_task: [groupId], fixed_task_item: items.map((i) => i.id) })
  })
}

export async function createItem(userId: string, groupId: string, input: CreateFixedTaskInput) {
  const data = await prepareText(input, userId)
  return withTransaction(async (tx) => {
    if (!(await repo.findOwnedGroup(tx, userId, groupId))) throw new NotFoundError()
    const sortOrder = await repo.nextItemSortOrder(tx, groupId)
    const item = await repo.insertItem(tx, { groupId, taskName: data.taskName, sortOrder })
    await enqueueIn(tx, "fixed_task_item", item.id, item)
    return item
  })
}

export async function updateItem(userId: string, groupId: string, itemId: string, input: UpdateFixedTaskInput) {
  const data = await prepareText(input, userId)
  return withTransaction(async (tx) => {
    if (!(await repo.findOwnedItem(tx, userId, groupId, itemId))) throw new NotFoundError()
    const item = await repo.updateItem(tx, itemId, data)
    await enqueueIn(tx, "fixed_task_item", item.id, data)
    return item
  })
}

export async function deleteItem(userId: string, groupId: string, itemId: string): Promise<void> {
  await withTransaction(async (tx) => {
    if (!(await repo.findOwnedItem(tx, userId, groupId, itemId))) throw new NotFoundError()
    await repo.deleteItem(tx, itemId)
    await purgeIn(tx, { fixed_task_item: [itemId] })
  })
}
