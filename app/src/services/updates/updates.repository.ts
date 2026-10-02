import type { Db } from "@/services/_shared/db"
import { NEWEST_FIRST } from "@/services/_shared/cursor"

/** Activity by anyone but `userId` (system entries without an actor count too). */
const byOthers = (userId: string) => ({ OR: [{ actorId: null }, { actorId: { not: userId } }] })

export function findVisit(db: Db, userId: string, projectId: string) {
  return db.projectVisit.findUnique({ where: { userId_projectId: { userId, projectId } }, select: { lastSeenAt: true } })
}

export function findVisits(db: Db, userId: string, projectIds: readonly string[]) {
  return db.projectVisit.findMany({ where: { userId, projectId: { in: [...projectIds] } }, select: { projectId: true, lastSeenAt: true } })
}

export function upsertVisit(db: Db, userId: string, projectId: string, lastSeenAt: Date) {
  return db.projectVisit.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId, lastSeenAt },
    update: { lastSeenAt },
  })
}

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

/** Newest activity of the project by others after `since` (bounded). */
export function findNewActivity(db: Db, userId: string, projectId: string, since: Date, take: number) {
  return db.activityLog.findMany({
    where: { projectId, createdAt: { gt: since }, ...byOthers(userId) },
    select: ACTIVITY_SELECT,
    orderBy: NEWEST_FIRST,
    take,
  })
}

export function countNewActivity(db: Db, userId: string, projectId: string, since: Date) {
  return db.activityLog.count({ where: { projectId, createdAt: { gt: since }, ...byOthers(userId) } })
}

/** New-activity counts for many projects, each with its own baseline (one grouped query). */
export async function countNewActivityByProject(db: Db, userId: string, baselines: ReadonlyMap<string, Date>): Promise<Map<string, number>> {
  if (baselines.size === 0) return new Map()
  const rows = await db.activityLog.groupBy({
    by: ["projectId"],
    where: {
      AND: [byOthers(userId), { OR: [...baselines].map(([projectId, since]) => ({ projectId, createdAt: { gt: since } })) }],
    },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.projectId, r._count._all]))
}

/** Unread notifications per project for the user (all types, and mentions only). */
export async function countUnreadByProject(db: Db, userId: string, projectIds: readonly string[]) {
  if (projectIds.length === 0) return { all: new Map<string, number>(), mentions: new Map<string, number>() }
  const where = { recipientId: userId, readAt: null, projectId: { in: [...projectIds] } }
  const [all, mentions] = await Promise.all([
    db.notification.groupBy({ by: ["projectId"], where, _count: { _all: true } }),
    db.notification.groupBy({ by: ["projectId"], where: { ...where, type: "mentioned" }, _count: { _all: true } }),
  ])
  const toMap = (rows: { projectId: string | null; _count: { _all: number } }[]) =>
    new Map(rows.filter((r) => r.projectId).map((r) => [r.projectId as string, r._count._all]))
  return { all: toMap(all), mentions: toMap(mentions) }
}

/** Marks the user's unread notifications of one project read. */
export function markProjectNotificationsRead(db: Db, userId: string, projectId: string, now: Date) {
  return db.notification.updateMany({ where: { recipientId: userId, projectId, readAt: null }, data: { readAt: now } })
}
