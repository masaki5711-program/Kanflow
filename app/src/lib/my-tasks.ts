/**
 * "My tasks" (home page) during the TaskAssignee transition (P2).
 *
 * A task is mine when a TaskAssignee row links it to my user id. Tasks that
 * have no TaskAssignee rows yet (created before the dual-write, until
 * scripts/migrate-assignees.ts has run) fall back to an EXACT match of my
 * display name inside the legacy comma-separated `assignee` string — the DB
 * filter is a coarse `contains`, refined by `isMyTask`.
 */
import { splitAssigneeNames } from "./assignees"

/** Prisma `where` fragment for SprintBacklogItem (combine with the sprint / project filters). */
export function myTaskAssigneeWhere(userId: string, userName: string | null | undefined) {
  const byId = { assignees: { some: { userId } } }
  const name = userName?.trim()
  if (!name) return byId
  return { OR: [byId, { assignees: { none: {} }, assignee: { contains: name } }] }
}

export interface MyTaskCandidate {
  assignee: string | null
  assignees: ReadonlyArray<{ userId: string }>
}

function tidy(value: string): string {
  return value.replace(/[\s　]+/g, " ").trim()
}

/** Exact refinement of `myTaskAssigneeWhere` (substring hits such as "Taro" in "Taro Yamada" are dropped). */
export function isMyTask(task: MyTaskCandidate, userId: string, userName: string | null | undefined): boolean {
  if (task.assignees.length > 0) return task.assignees.some((a) => a.userId === userId)
  const name = userName ? tidy(userName) : ""
  if (!name) return false
  return splitAssigneeNames(task.assignee).includes(name)
}
