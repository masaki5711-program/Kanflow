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
