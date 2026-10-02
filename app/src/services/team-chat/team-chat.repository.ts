import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"

const USER = { select: { id: true, name: true } } as const

/**
 * Visible rows: not deleted; a pure mirror (no own body) only while its
 * comment is live. A chat reply that was also posted to a thread keeps
 * showing even if that comment is deleted later.
 */
export const VISIBLE_MESSAGE = {
  deletedAt: null,
  OR: [{ body: { not: null } }, { commentId: null }, { comment: { deletedAt: null } }],
} satisfies Prisma.TeamMessageWhereInput

export const MESSAGE_INCLUDE = {
  author: USER,
  attachments: { select: { id: true, originalName: true, mimeType: true, fileSize: true }, orderBy: { createdAt: "asc" } },
  mentions: { select: { user: USER } },
  comment: {
    select: { id: true, body: true, entityType: true, entityId: true, deletedAt: true, editedAt: true, mentions: { select: { user: USER } } },
  },
  replyTo: {
    select: {
      id: true,
      body: true,
      deletedAt: true,
      author: USER,
      comment: { select: { body: true, deletedAt: true, entityType: true, entityId: true } },
      _count: { select: { attachments: true } },
    },
  },
} as const satisfies Prisma.TeamMessageInclude

export type MessageRow = Prisma.TeamMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>

/** Messages that concern the viewer: they are mentioned, or someone replied to them. */
export function concernsUser(userId: string): Prisma.TeamMessageWhereInput {
  return {
    OR: [
      { mentions: { some: { userId } } },
      { comment: { mentions: { some: { userId } } } },
      { replyTo: { authorId: userId }, authorId: { not: userId } },
    ],
  }
}

export interface ListArgs {
  /** Older than this time (paging back). */
  before?: Date
  /** At or after this time (polling for new ones; the client drops duplicates). */
  after?: Date
  take: number
  onlyFor?: string
}

export function findMessages(db: Db, projectId: string, args: ListArgs) {
  const where: Prisma.TeamMessageWhereInput = {
    projectId,
    ...VISIBLE_MESSAGE,
    ...(args.before ? { createdAt: { lt: args.before } } : {}),
    ...(args.after ? { createdAt: { gte: args.after } } : {}),
    ...(args.onlyFor ? { AND: [concernsUser(args.onlyFor)] } : {}),
  }
  return db.teamMessage.findMany({
    where,
    include: MESSAGE_INCLUDE,
    orderBy: [{ createdAt: args.after ? "asc" : "desc" }, { id: args.after ? "asc" : "desc" }],
    take: args.take,
  })
}

export function findMessage(db: Db, projectId: string, id: string) {
  return db.teamMessage.findFirst({ where: { id, projectId }, include: MESSAGE_INCLUDE })
}

export function insertMessage(db: Db, data: { projectId: string; authorId: string; body: string | null; replyToId: string | null; commentId?: string | null }) {
  return db.teamMessage.create({ data, select: { id: true } })
}

/** Mirror row of a new comment (its text is read from the comment). */
export function insertMirror(db: Db, data: { projectId: string; authorId: string; commentId: string }) {
  return db.teamMessage.create({ data: { ...data, body: null }, select: { id: true } })
}

export function insertMentions(db: Db, messageId: string, userIds: readonly string[]) {
  if (userIds.length === 0) return Promise.resolve({ count: 0 })
  return db.teamMessageMention.createMany({ data: userIds.map((userId) => ({ messageId, userId })), skipDuplicates: true })
}

export function insertAttachments(
  db: Db,
  messageId: string,
  files: readonly { fileName: string; originalName: string; fileSize: number; mimeType: string }[],
) {
  if (files.length === 0) return Promise.resolve({ count: 0 })
  return db.teamMessageAttachment.createMany({ data: files.map((f) => ({ ...f, messageId })) })
}

export function softDeleteMessage(db: Db, id: string, now: Date) {
  return db.teamMessage.update({ where: { id }, data: { deletedAt: now } })
}

/** Stored files of a message (deleted together with it). */
export function findAttachmentFiles(db: Db, messageId: string) {
  return db.teamMessageAttachment.findMany({ where: { messageId }, select: { fileName: true } })
}

/** Attachment rows of a message (after their files were removed). */
export function deleteAttachmentRows(db: Db, messageId: string) {
  return db.teamMessageAttachment.deleteMany({ where: { messageId } })
}

export function findAttachment(db: Db, projectId: string, attachmentId: string) {
  return db.teamMessageAttachment.findFirst({
    where: { id: attachmentId, message: { projectId, deletedAt: null } },
    select: { fileName: true, originalName: true, mimeType: true },
  })
}

export function findRead(db: Db, userId: string, projectId: string) {
  return db.teamChatRead.findUnique({ where: { userId_projectId: { userId, projectId } }, select: { lastReadAt: true } })
}

export function upsertRead(db: Db, userId: string, projectId: string, lastReadAt: Date) {
  return db.teamChatRead.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId, lastReadAt },
    update: { lastReadAt },
  })
}

/** Unread messages by others after `since`, and how many of them concern the user. */
export async function countUnread(db: Db, userId: string, projectId: string, since: Date) {
  const base: Prisma.TeamMessageWhereInput = { projectId, ...VISIBLE_MESSAGE, createdAt: { gt: since }, authorId: { not: userId } }
  const [unread, forYou] = await Promise.all([
    db.teamMessage.count({ where: base }),
    db.teamMessage.count({ where: { ...base, AND: [concernsUser(userId)] } }),
  ])
  return { unread, forYou }
}

/** Display labels of the commented entities behind mirrored messages. */
export async function findSourceLabels(db: Db, projectId: string, ids: { pbi: string[]; sprint_task: string[]; icebox: string[] }) {
  const [pbis, tasks, icebox] = await Promise.all([
    ids.pbi.length
      ? db.productBacklogItem.findMany({ where: { projectId, id: { in: ids.pbi } }, select: { id: true, displayId: true, initiative: true, userStory: true } })
      : [],
    ids.sprint_task.length
      ? db.sprintBacklogItem.findMany({ where: { id: { in: ids.sprint_task }, sprint: { projectId } }, select: { id: true, taskName: true, sprintId: true, sprint: { select: { sprintName: true } } } })
      : [],
    ids.icebox.length
      ? db.iceboxItem.findMany({ where: { projectId, id: { in: ids.icebox } }, select: { id: true, displayId: true, request: true } })
      : [],
  ])
  return { pbis, tasks, icebox }
}
