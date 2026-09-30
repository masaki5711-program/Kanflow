import type { Db } from "@/services/_shared/db"
import { decodeCursor } from "@/services/_shared/cursor"

/**
 * ChatThread / ChatMessage data access. Every thread lookup is scoped by
 * (id, projectId, userId, deletedAt = null): a thread of another user, of
 * another project or in the trash is simply "not found".
 */

export interface ThreadOwner {
  projectId: string
  userId: string
}

const THREAD_SELECT = { id: true, title: true, createdAt: true, updatedAt: true } as const

export type ThreadRow = { id: string; title: string; createdAt: Date; updatedAt: Date }

/** Rows after the cursor in (updatedAt DESC, id DESC) order — the list is "most recently active first". */
function afterUpdatedCursor(cursor: string | undefined) {
  if (!cursor) return {}
  const { createdAt: updatedAt, id } = decodeCursor(cursor)
  return { OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: id } }] }
}

export function findThreads(db: Db, owner: ThreadOwner, cursor: string | undefined, take: number): Promise<ThreadRow[]> {
  return db.chatThread.findMany({
    where: { projectId: owner.projectId, userId: owner.userId, deletedAt: null, ...afterUpdatedCursor(cursor) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    select: THREAD_SELECT,
  })
}

export function findOwnedThread(db: Db, owner: ThreadOwner, threadId: string): Promise<ThreadRow | null> {
  return db.chatThread.findFirst({
    where: { id: threadId, projectId: owner.projectId, userId: owner.userId, deletedAt: null },
    select: THREAD_SELECT,
  })
}

export function createThread(db: Db, owner: ThreadOwner, title: string): Promise<ThreadRow> {
  return db.chatThread.create({ data: { projectId: owner.projectId, userId: owner.userId, title }, select: THREAD_SELECT })
}

export function updateThreadTitle(db: Db, threadId: string, title: string): Promise<ThreadRow> {
  return db.chatThread.update({ where: { id: threadId }, data: { title }, select: THREAD_SELECT })
}

export function softDeleteThread(db: Db, threadId: string, at: Date) {
  return db.chatThread.update({ where: { id: threadId }, data: { deletedAt: at }, select: { id: true } })
}

/** Bump the thread's last-activity time (list order). */
export function touchThread(db: Db, threadId: string, at: Date) {
  return db.chatThread.update({ where: { id: threadId }, data: { updatedAt: at }, select: { id: true } })
}

export interface NewMessage {
  threadId: string
  role: "user" | "assistant"
  content: string
  toolEvents?: string | null
  partial?: boolean
}

export function insertMessage(db: Db, msg: NewMessage) {
  return db.chatMessage.create({
    data: {
      threadId: msg.threadId,
      role: msg.role,
      content: msg.content,
      toolEvents: msg.toolEvents ?? null,
      partial: msg.partial ?? false,
    },
    select: { id: true },
  })
}

export type MessageRow = {
  id: string
  role: string
  content: string
  toolEvents: string | null
  partial: boolean
  createdAt: Date
}

/** Newest `take` messages of the thread, returned oldest first. */
export async function findLatestMessages(db: Db, threadId: string, take: number): Promise<MessageRow[]> {
  const rows = await db.chatMessage.findMany({
    where: { threadId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: { id: true, role: true, content: true, toolEvents: true, partial: true, createdAt: true },
  })
  return [...rows].reverse()
}

export type ProposalMessageRow = { id: string; toolEvents: string | null }

/** Assistant messages of the thread whose stored events mention `proposalId`, oldest first. */
export function findProposalMessages(db: Db, threadId: string, proposalId: string): Promise<ProposalMessageRow[]> {
  return db.chatMessage.findMany({
    where: { threadId, role: "assistant", toolEvents: { contains: proposalId } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, toolEvents: true },
  })
}

/**
 * Compare-and-set of a message's stored events: writes `next` only while the
 * row still holds `expected` (one atomic UPDATE … WHERE toolEvents = ?).
 * Returns false when another request changed it first.
 */
export async function swapToolEvents(db: Db, messageId: string, expected: string | null, next: string | null): Promise<boolean> {
  const { count } = await db.chatMessage.updateMany({
    where: { id: messageId, toolEvents: expected },
    data: { toolEvents: next },
  })
  return count === 1
}
