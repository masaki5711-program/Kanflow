import type { Db } from "@/services/_shared/db"
import { afterCursorWhere, NEWEST_FIRST } from "@/services/_shared/cursor"
import { NOT_DELETED } from "@/services/_shared/soft-delete"

const ACTIVITY_SELECT = {
  id: true,
  projectId: true,
  entityType: true,
  entityId: true,
  action: true,
  actorId: true,
  actorName: true,
  diff: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} as const

interface PageArgs {
  cursor?: string
  /** Page size; one extra row is fetched to detect a next page. */
  limit: number
}

/** Project feed, newest first; optional entityType filter. */
export function findProjectActivity(db: Db, projectId: string, args: PageArgs & { entityType?: string }) {
  return db.activityLog.findMany({
    where: { projectId, ...(args.entityType ? { entityType: args.entityType } : {}), ...afterCursorWhere(args.cursor) },
    select: ACTIVITY_SELECT,
    orderBy: NEWEST_FIRST,
    take: args.limit + 1,
  })
}

/** Ids per entity type whose feed label is looked up (entries logged without one). */
export interface LabelLookup {
  pbi: string[]
  sprint_task: string[]
  sprint: string[]
  plan_item: string[]
}

/** Label source rows of the given entities in the project (trashed ones included — old entries still name them). */
export async function findEntityLabelRows(db: Db, projectId: string, ids: LabelLookup) {
  const none = Promise.resolve([])
  const [pbis, tasks, sprints, planItems] = await Promise.all([
    ids.pbi.length ? db.productBacklogItem.findMany({ where: { projectId, id: { in: ids.pbi } }, select: { id: true, displayId: true, initiative: true, userStory: true } }) : none,
    ids.sprint_task.length ? db.sprintBacklogItem.findMany({ where: { sprint: { projectId }, id: { in: ids.sprint_task } }, select: { id: true, taskName: true } }) : none,
    ids.sprint.length ? db.sprint.findMany({ where: { projectId, id: { in: ids.sprint } }, select: { id: true, sprintName: true } }) : none,
    ids.plan_item.length ? db.planItem.findMany({ where: { projectId, id: { in: ids.plan_item } }, select: { id: true, name: true } }) : none,
  ])
  return { pbis, tasks, sprints, planItems }
}

/** Names of the given users (member feed entries logged without a name). */
export function findUserNames(db: Db, userIds: readonly string[]) {
  return db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
}

/** History of one entity (scoped to the project), newest first. */
export function findEntityActivity(db: Db, projectId: string, entityType: string, entityId: string, args: PageArgs) {
  return db.activityLog.findMany({
    where: { projectId, entityType, entityId, ...afterCursorWhere(args.cursor) },
    select: ACTIVITY_SELECT,
    orderBy: NEWEST_FIRST,
    take: args.limit + 1,
  })
}

/** What a user did, across projects that are not in the trash, newest first. */
export function findUserActivity(db: Db, userId: string, args: PageArgs) {
  return db.activityLog.findMany({
    where: { actorId: userId, project: NOT_DELETED, ...afterCursorWhere(args.cursor) },
    select: { ...ACTIVITY_SELECT, project: { select: { id: true, name: true } } },
    orderBy: NEWEST_FIRST,
    take: args.limit + 1,
  })
}
