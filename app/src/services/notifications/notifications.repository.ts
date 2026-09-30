import type { Db } from "@/services/_shared/db"
import { afterCursorWhere, NEWEST_FIRST } from "@/services/_shared/cursor"
import { NOT_DELETED } from "@/services/_shared/soft-delete"
import { notificationGroupWhere, type NotificationGroup } from "@/lib/notification-groups"

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  projectId: true,
  entityType: true,
  entityId: true,
  payload: true,
  readAt: true,
  createdAt: true,
  project: { select: { id: true, name: true } },
} as const

/** Notifications of trashed projects are hidden (they come back on restore). */
const VISIBLE = { OR: [{ projectId: null }, { project: NOT_DELETED }] }

export interface FindNotificationsArgs {
  cursor?: string
  limit: number
  unreadOnly: boolean
  group?: NotificationGroup
  state?: "unread" | "read"
}

function readStateWhere(args: Pick<FindNotificationsArgs, "unreadOnly" | "state">) {
  if (args.unreadOnly || args.state === "unread") return { readAt: null }
  if (args.state === "read") return { readAt: { not: null } }
  return {}
}

export function findNotifications(db: Db, userId: string, args: FindNotificationsArgs) {
  return db.notification.findMany({
    where: {
      recipientId: userId,
      ...readStateWhere(args),
      ...notificationGroupWhere(args.group ?? "all"),
      AND: [VISIBLE, afterCursorWhere(args.cursor)],
    },
    select: NOTIFICATION_SELECT,
    orderBy: NEWEST_FIRST,
    take: args.limit + 1,
  })
}

export function countUnread(db: Db, userId: string, group: NotificationGroup = "all") {
  return db.notification.count({ where: { recipientId: userId, readAt: null, ...notificationGroupWhere(group), ...VISIBLE } })
}

/** Marks one of the user's unread notifications read; `count` 0 = already read or not theirs. */
export function markRead(db: Db, userId: string, id: string, now: Date) {
  return db.notification.updateMany({ where: { id, recipientId: userId, readAt: null }, data: { readAt: now } })
}

export function findOwnNotificationId(db: Db, userId: string, id: string) {
  return db.notification.findFirst({ where: { id, recipientId: userId }, select: { id: true } })
}

export function markAllRead(db: Db, userId: string, now: Date) {
  return db.notification.updateMany({ where: { recipientId: userId, readAt: null }, data: { readAt: now } })
}

export function findPreferences(db: Db, userId: string) {
  return db.notificationPreference.findMany({ where: { userId }, select: { type: true, enabled: true } })
}

export function upsertPreference(db: Db, userId: string, type: string, enabled: boolean) {
  return db.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    create: { userId, type, enabled },
    update: { enabled },
  })
}
