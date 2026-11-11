import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"

/**
 * Persistence of the White Board's working-together parts (B7): who has a sheet open, saved versions of a sheet,
 * comments, and the backlog items boxes stand for. Functions take the client or a transaction first.
 */

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export function upsertPresence(db: Db, row: { sheetId: string; userId: string; userName: string; selection: string[] }) {
  return db.boardPresence.upsert({
    where: { sheetId_userId: { sheetId: row.sheetId, userId: row.userId } },
    create: { ...row, seenAt: new Date() },
    update: { userName: row.userName, selection: row.selection, seenAt: new Date() },
  })
}

/** The others seen on the sheet since `since`. */
export function findPresence(db: Db, sheetId: string, since: Date, exceptUserId: string) {
  return db.boardPresence.findMany({
    where: { sheetId, seenAt: { gte: since }, userId: { not: exceptUserId } },
    orderBy: [{ userName: "asc" }, { userId: "asc" }],
    take: 50,
    select: { userId: true, userName: true, selection: true },
  })
}

export function deletePresence(db: Db, sheetId: string, userId: string) {
  return db.boardPresence.deleteMany({ where: { sheetId, userId } })
}

/** The sheet's rows nobody refreshed for a long time (a closed tab that never said goodbye). Few rows per sheet. */
export function prunePresence(db: Db, sheetId: string, before: Date) {
  return db.boardPresence.deleteMany({ where: { sheetId, seenAt: { lt: before } } })
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

const VERSION_SUMMARY = { id: true, label: true, auto: true, elementCount: true, rev: true, createdById: true, createdByName: true, createdAt: true } as const

export function latestVersion(db: Db, sheetId: string) {
  return db.boardSheetVersion.findFirst({ where: { sheetId }, orderBy: { createdAt: "desc" }, select: { createdAt: true, rev: true } })
}

export function createVersion(
  db: Db,
  data: { sheetId: string; label: string; auto: boolean; elements: Prisma.InputJsonValue; elementCount: number; rev: number; createdById: string | null; createdByName: string },
) {
  return db.boardSheetVersion.create({ data, select: VERSION_SUMMARY })
}

export function listVersions(db: Db, sheetId: string, take: number) {
  return db.boardSheetVersion.findMany({ where: { sheetId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, select: VERSION_SUMMARY })
}

export function findVersion(db: Db, sheetId: string, versionId: string) {
  return db.boardSheetVersion.findFirst({ where: { id: versionId, sheetId }, select: { ...VERSION_SUMMARY, elements: true } })
}

export function countNamedVersions(db: Db, sheetId: string) {
  return db.boardSheetVersion.count({ where: { sheetId, auto: false } })
}

/** Deletes the oldest automatic versions above `keep` automatic ones (versions saved by hand are counted apart). */
export async function trimVersions(db: Db, sheetId: string, keep: number): Promise<number> {
  const rows = await db.boardSheetVersion.findMany({ where: { sheetId, auto: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } })
  if (rows.length <= keep) return 0
  const drop = rows.slice(keep).map((r) => r.id)
  const { count } = await db.boardSheetVersion.deleteMany({ where: { id: { in: drop } } })
  return count
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

const COMMENT_FIELDS = { id: true, sheetId: true, elementId: true, authorId: true, body: true, resolvedAt: true, createdAt: true } as const

export function listComments(db: Db, boardId: string, take: number) {
  return db.boardComment.findMany({ where: { boardId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take, select: COMMENT_FIELDS })
}

export function countComments(db: Db, boardId: string) {
  return db.boardComment.count({ where: { boardId } })
}

export function createComment(db: Db, data: { boardId: string; sheetId: string; elementId: string | null; authorId: string; body: string }) {
  return db.boardComment.create({ data, select: COMMENT_FIELDS })
}

export function findComment(db: Db, boardId: string, commentId: string) {
  return db.boardComment.findFirst({ where: { id: commentId, boardId }, select: COMMENT_FIELDS })
}

export function setCommentResolved(db: Db, commentId: string, resolvedById: string | null) {
  return db.boardComment.update({
    where: { id: commentId },
    data: resolvedById ? { resolvedAt: new Date(), resolvedById } : { resolvedAt: null, resolvedById: null },
    select: COMMENT_FIELDS,
  })
}

export function deleteComment(db: Db, commentId: string) {
  return db.boardComment.delete({ where: { id: commentId } })
}

/** Names of users (authors of comments), by id. */
export function findUserNames(db: Db, ids: readonly string[]) {
  return db.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } })
}

// ---------------------------------------------------------------------------
// Backlog items (PBIs) on boards
// ---------------------------------------------------------------------------

/** The project's live backlog items among `ids`: what a box needs to show (read live, never copied into the board). */
export function findBacklogItems(db: Db, projectId: string, ids: readonly string[]) {
  return db.productBacklogItem.findMany({
    where: { projectId, id: { in: [...ids] }, deletedAt: null },
    select: { id: true, displayId: true, initiative: true, userStory: true, status: true, assignedPo: true, confidential: true },
  })
}

/** The project's live backlog items whose number or text holds `query` (the link dialog's search). */
export function searchBacklogItems(db: Db, projectId: string, query: string, take: number) {
  const number = /^#?(\d{1,9})$/.exec(query.trim())
  return db.productBacklogItem.findMany({
    where: {
      projectId,
      deletedAt: null,
      ...(query.trim() === ""
        ? {}
        : number
          ? { displayId: Number(number[1]) }
          : { OR: [{ initiative: { contains: query, mode: "insensitive" } }, { userStory: { contains: query, mode: "insensitive" } }] }),
    },
    orderBy: { displayId: "desc" },
    take,
    select: { id: true, displayId: true, initiative: true, userStory: true, status: true, assignedPo: true, confidential: true },
  })
}

/**
 * The live elements of the project's live boards that stand for the backlog item: board, sheet and element ids.
 * A JSON lookup over the project's board elements (bounded by `take`).
 */
export function findElementsOfPbi(db: Db, projectId: string, pbiId: string, take: number) {
  return db.boardElement.findMany({
    where: { deleted: false, data: { path: ["pbiId"], equals: pbiId }, sheet: { board: { projectId, deletedAt: null } } },
    orderBy: { updatedAt: "desc" },
    take,
    select: { elementId: true, sheet: { select: { id: true, name: true, board: { select: { id: true, title: true } } } } },
  })
}
