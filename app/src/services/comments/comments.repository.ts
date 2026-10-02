import type { Db } from "@/services/_shared/db"
import { afterCursorWhereAsc, OLDEST_FIRST } from "@/services/_shared/cursor"
import { LIVE_PBI, NOT_DELETED } from "@/services/_shared/soft-delete"
import type { CommentEntityType } from "./comments.schemas"

/** Upper bound of members loaded for mention resolution. */
const MEMBER_LIMIT = 1000

export const COMMENT_SELECT = {
  id: true,
  projectId: true,
  entityType: true,
  entityId: true,
  authorId: true,
  body: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  author: { select: { id: true, name: true } },
  mentions: { select: { user: { select: { id: true, name: true } } } },
} as const

interface PageArgs {
  cursor?: string
  /** Page size; one extra row is fetched to detect a next page. */
  limit: number
}

/** One entity's thread, oldest first (deleted comments included as tombstones). */
export function findComments(db: Db, projectId: string, entityType: CommentEntityType, entityId: string, args: PageArgs) {
  return db.comment.findMany({
    where: { projectId, entityType, entityId, ...afterCursorWhereAsc(args.cursor) },
    select: COMMENT_SELECT,
    orderBy: OLDEST_FIRST,
    take: args.limit + 1,
  })
}

export function findComment(db: Db, projectId: string, commentId: string) {
  return db.comment.findFirst({ where: { id: commentId, projectId }, select: COMMENT_SELECT })
}

/** Live (not deleted) comment counts per entity id; ids without comments are absent. */
export async function countComments(
  db: Db,
  projectId: string,
  entityType: CommentEntityType,
  entityIds: readonly string[]
): Promise<Map<string, number>> {
  const rows = await db.comment.groupBy({
    by: ["entityId"],
    where: { projectId, entityType, entityId: { in: [...entityIds] }, ...NOT_DELETED },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.entityId, r._count._all]))
}

export interface NewComment {
  projectId: string
  entityType: CommentEntityType
  entityId: string
  authorId: string
  body: string
}

export function createComment(db: Db, data: NewComment) {
  return db.comment.create({ data, select: { id: true } })
}

export function updateCommentBody(db: Db, commentId: string, body: string, editedAt: Date) {
  return db.comment.update({ where: { id: commentId }, data: { body, editedAt }, select: { id: true } })
}

export function softDeleteComment(db: Db, commentId: string, deletedAt: Date) {
  return db.comment.update({ where: { id: commentId }, data: { deletedAt }, select: { id: true } })
}

/** Replace the mention rows of a comment. */
export async function replaceMentions(db: Db, commentId: string, userIds: readonly string[]): Promise<void> {
  await db.commentMention.deleteMany({ where: { commentId } })
  if (userIds.length === 0) return
  await db.commentMention.createMany({ data: userIds.map((userId) => ({ commentId, userId })), skipDuplicates: true })
}

/** Project members as mention candidates `{ id: userId, name }`. */
export async function findMentionCandidates(db: Db, projectId: string) {
  const rows = await db.projectMember.findMany({
    where: { projectId },
    select: { userId: true, user: { select: { name: true } } },
    take: MEMBER_LIMIT,
  })
  return rows.map((r) => ({ id: r.userId, name: r.user.name }))
}

/** The live PBI of the project. */
export function findPbiTarget(db: Db, projectId: string, id: string) {
  return db.productBacklogItem.findFirst({
    where: { id, projectId, ...NOT_DELETED },
    select: { id: true, displayId: true, initiative: true, userStory: true, assignedPo: true },
  })
}

/** A task of a sprint of the project whose PBI is live. */
export function findSprintTaskTarget(db: Db, projectId: string, id: string) {
  return db.sprintBacklogItem.findFirst({
    where: { id, sprint: { projectId }, ...LIVE_PBI },
    select: { id: true, sprintId: true, taskName: true, assignee: true, assignees: { select: { userId: true } } },
  })
}

/** The live Icebox item of the project. */
export function findIceboxTarget(db: Db, projectId: string, id: string) {
  return db.iceboxItem.findFirst({
    where: { id, projectId, ...NOT_DELETED },
    select: { id: true, displayId: true, request: true, author: true, assignedPo: true },
  })
}

/** Notification types a comment thread answers (reading the thread marks them read). */
export const THREAD_NOTIFICATION_TYPES = ["mentioned", "comment"] as const

/** The user's unread mention / comment notifications per entity (badge "unread"). */
export async function countUnreadForUser(db: Db, userId: string, projectId: string, entityType: string, ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const rows = await db.notification.groupBy({
    by: ["entityId"],
    where: { recipientId: userId, projectId, readAt: null, entityType, entityId: { in: [...ids] }, type: { in: [...THREAD_NOTIFICATION_TYPES] } },
    _count: { _all: true },
  })
  return new Map(rows.filter((r) => r.entityId).map((r) => [r.entityId as string, r._count._all]))
}

/** Marks the user's unread mention / comment notifications of one entity read. */
export function markEntityNotificationsRead(db: Db, userId: string, projectId: string, entityType: string, entityId: string, now: Date) {
  return db.notification.updateMany({
    where: { recipientId: userId, projectId, readAt: null, entityType, entityId, type: { in: [...THREAD_NOTIFICATION_TYPES] } },
    data: { readAt: now },
  })
}

