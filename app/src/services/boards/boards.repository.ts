import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"

/**
 * Persistence of ボード: board → sheets → elements (one row per element). Functions take the client or
 * a transaction first. Element rows are never updated in place: a write replaces the row, so `rev` (the
 * sheet revision the row was written in) always tells a reader whether it has seen the row.
 */

const BOARD_FIELDS = {
  id: true,
  projectId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedById: true,
} as const

const SHEET_FIELDS = { id: true, name: true, sortOrder: true, rev: true } as const

const ELEMENT_FIELDS = { elementId: true, version: true, deleted: true, data: true, rev: true, createdAt: true } as const

/** Rows per multi-row statement (PostgreSQL takes at most 65,535 bind values per statement). */
const INSERT_CHUNK = 1000

export type BoardRow = Awaited<ReturnType<typeof findBoard>>
export type ElementRow = Awaited<ReturnType<typeof findElementsByIds>>[number]

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** Live boards (latest change first) or the trashed ones (latest deletion first). */
export function findBoards(db: Db, projectId: string, trashed: boolean, take: number) {
  return db.board.findMany({
    where: { projectId, deletedAt: trashed ? { not: null } : null },
    orderBy: trashed ? [{ deletedAt: "desc" }, { id: "asc" }] : [{ updatedAt: "desc" }, { id: "asc" }],
    take,
    select: { ...BOARD_FIELDS, _count: { select: { sheets: true } } },
  })
}

export function countLiveBoards(db: Db, projectId: string) {
  return db.board.count({ where: { projectId, deletedAt: null } })
}

/** The board of this project (live or trashed) with its sheets in tab order, or null. */
export function findBoard(db: Db, projectId: string, boardId: string) {
  return db.board.findFirst({
    where: { id: boardId, projectId },
    select: { ...BOARD_FIELDS, sheets: { select: SHEET_FIELDS, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  })
}

export function createBoard(db: Db, data: { projectId: string; title: string; createdById: string; sheetName: string }) {
  return db.board.create({
    data: {
      projectId: data.projectId,
      title: data.title,
      createdById: data.createdById,
      sheets: { create: [{ name: data.sheetName, sortOrder: 0 }] },
    },
    select: { ...BOARD_FIELDS, sheets: { select: SHEET_FIELDS, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  })
}

export function updateBoard(db: Db, boardId: string, data: Prisma.BoardUncheckedUpdateInput) {
  return db.board.update({ where: { id: boardId }, data, select: BOARD_FIELDS })
}

/** Marks the board as changed now (the list sorts by it). */
export function touchBoard(db: Db, boardId: string, now: Date = new Date()) {
  return db.board.update({ where: { id: boardId }, data: { updatedAt: now }, select: { id: true } })
}

/**
 * Row lock on the board for the rest of the transaction: serializes the changes of its sheet list
 * (add / duplicate / delete / reorder), whose rules (at most N, at least one) are check-then-write.
 */
export async function lockBoard(db: Db, boardId: string): Promise<void> {
  await db.$queryRaw`SELECT "id" FROM "board" WHERE "id" = ${boardId} FOR UPDATE`
}

/** Boards that sat in the trash since before `cutoff` (the purge job). */
export function findExpiredTrashedBoards(db: Db, cutoff: Date, take: number) {
  return db.board.findMany({
    where: { deletedAt: { lt: cutoff } },
    orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
    take,
    select: { id: true, projectId: true },
  })
}

// ---------------------------------------------------------------------------
// Files (images placed on a board)
// ---------------------------------------------------------------------------

const FILE_FIELDS = { id: true, fileName: true, mimeType: true, fileSize: true } as const

export function countBoardFiles(db: Db, boardId: string) {
  return db.boardFile.count({ where: { boardId } })
}

export function createBoardFile(db: Db, data: { boardId: string; fileName: string; mimeType: string; fileSize: number; createdById: string }) {
  return db.boardFile.create({ data, select: FILE_FIELDS })
}

export function findBoardFile(db: Db, boardId: string, fileId: string) {
  return db.boardFile.findFirst({ where: { id: fileId, boardId }, select: FILE_FIELDS })
}

/** Stored names of every file of the board (to remove them from disk when the board is purged). */
export async function findBoardFileNames(db: Db, boardId: string): Promise<string[]> {
  const rows = await db.boardFile.findMany({ where: { boardId }, select: { fileName: true } })
  return rows.map((r) => r.fileName)
}

/** Permanent delete of trashed boards of the project (sheets and elements go with them). */
export function deleteTrashedBoard(db: Db, projectId: string, boardId: string) {
  return db.board.deleteMany({ where: { id: boardId, projectId, deletedAt: { not: null } } })
}

/** id → display name of the given users (unknown / deleted users are absent). */
export async function findUserNames(db: Db, userIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()
  const rows = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } })
  return new Map(rows.map((u) => [u.id, u.name]))
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

export function createSheet(db: Db, data: { boardId: string; name: string; sortOrder: number; rev?: number }) {
  return db.boardSheet.create({ data, select: SHEET_FIELDS })
}

export function renameSheet(db: Db, sheetId: string, name: string) {
  return db.boardSheet.update({ where: { id: sheetId }, data: { name }, select: SHEET_FIELDS })
}

export function setSheetOrder(db: Db, sheetId: string, sortOrder: number) {
  return db.boardSheet.update({ where: { id: sheetId }, data: { sortOrder }, select: { id: true } })
}

export function deleteSheet(db: Db, sheetId: string) {
  return db.boardSheet.delete({ where: { id: sheetId }, select: { id: true } })
}

/**
 * Row lock on the sheet for the rest of the transaction, returning its revision (null: no such sheet in
 * the board). Element writes of one sheet run one after another, so the merge reads what the previous
 * writer committed and each write gets its own revision.
 */
export async function lockSheet(db: Db, boardId: string, sheetId: string): Promise<{ rev: number } | null> {
  const rows = await db.$queryRaw<Array<{ rev: number }>>`
    SELECT "rev" FROM "board_sheet" WHERE "id" = ${sheetId} AND "boardId" = ${boardId} FOR UPDATE`
  return rows.length > 0 ? { rev: Number(rows[0].rev) } : null
}

export function findSheetRev(db: Db, boardId: string, sheetId: string) {
  return db.boardSheet.findFirst({ where: { id: sheetId, boardId }, select: { rev: true } })
}

export function setSheetRev(db: Db, sheetId: string, rev: number) {
  return db.boardSheet.update({ where: { id: sheetId }, data: { rev }, select: { id: true } })
}

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

/** The live elements of a sheet (a full read). */
export function findLiveElements(db: Db, sheetId: string) {
  return db.boardElement.findMany({ where: { sheetId, deleted: false }, select: ELEMENT_FIELDS, orderBy: [{ createdAt: "asc" }, { elementId: "asc" }] })
}

/** Everything written after revision `since`, deleted elements included (a delta read). */
export function findElementsSince(db: Db, sheetId: string, since: number) {
  return db.boardElement.findMany({ where: { sheetId, rev: { gt: since } }, select: ELEMENT_FIELDS, orderBy: [{ rev: "asc" }, { elementId: "asc" }] })
}

export function findElementsByIds(db: Db, sheetId: string, elementIds: readonly string[]) {
  return db.boardElement.findMany({ where: { sheetId, elementId: { in: [...elementIds] } }, select: ELEMENT_FIELDS })
}

export function countLiveElements(db: Db, sheetId: string) {
  return db.boardElement.count({ where: { sheetId, deleted: false } })
}

/** Every stored row of a sheet, tombstones included. */
export function countElements(db: Db, sheetId: string) {
  return db.boardElement.count({ where: { sheetId } })
}

export interface ElementRowInput {
  elementId: string
  version: number
  deleted: boolean
  data: Prisma.InputJsonObject
  rev: number
  updatedById: string | null
  /** When the element was first stored (kept across writes); omitted for a new element. */
  createdAt?: Date
}

/** Stores the given rows in place of whatever the sheet holds under the same element ids. */
export async function replaceElements(db: Db, sheetId: string, rows: readonly ElementRowInput[]): Promise<void> {
  if (rows.length === 0) return
  await db.boardElement.deleteMany({ where: { sheetId, elementId: { in: rows.map((r) => r.elementId) } } })
  await insertElements(db, sheetId, rows)
}

/** Inserts rows into a sheet that holds none of their element ids. */
export async function insertElements(db: Db, sheetId: string, rows: readonly ElementRowInput[]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.boardElement.createMany({ data: rows.slice(i, i + INSERT_CHUNK).map((r) => ({ ...r, sheetId })) })
  }
}
