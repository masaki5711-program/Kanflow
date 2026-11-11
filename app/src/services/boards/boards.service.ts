import type { Prisma } from "@/generated/prisma/client"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { planMerge, type ExistingElement } from "@/lib/board/merge"
import type { StoredElement } from "@/lib/board/model"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import { RESTORE_DATA, softDeleteData } from "@/services/_shared/soft-delete"
import * as repo from "./boards.repository"
import type { CreateBoardInput, ReorderSheetsInput, SheetNameInput, UpdateBoardInput, WriteElementsInput } from "./boards.schemas"

/**
 * ボード (docs/plan/10-board.md): a project's drawing boards, their sheets and the elements on a sheet.
 *
 * Authorization is decided in the routes (board.read / board.write / board.manage); every function here
 * is scoped to `projectId` and answers 404 for a board of another project or one in the trash.
 *
 * Board content stays inside this API: nothing here writes to the activity log, the search index, MCP,
 * GitStation or an LLM job.
 */

export interface BoardSummaryDto {
  id: string
  title: string
  sheetCount: number
  createdAt: string
  updatedAt: string
  /** Set for a board in the trash. */
  deletedAt: string | null
  deletedBy: { id: string; name: string | null } | null
}

export interface BoardListDto {
  boards: BoardSummaryDto[]
  /** Live boards a project may hold. */
  limit: number
}

export interface BoardSheetDto {
  id: string
  name: string
  /** Revision of the sheet's elements (grows by one per write that changed something). */
  rev: number
}

export interface BoardDto {
  id: string
  title: string
  updatedAt: string
  /** In tab order. */
  sheets: BoardSheetDto[]
}

export interface SheetCreatedDto {
  board: BoardDto
  /** The sheet just added. */
  sheetId: string
}

export interface ElementsDto {
  /** The sheet revision this answer is complete up to. */
  rev: number
  /** true: every live element. false: only what changed after `since`, deleted elements included. */
  full: boolean
  elements: StoredElement[]
}

export interface WriteResultDto {
  rev: number
  /** How many of the sent elements were stored. */
  applied: number
  /** Sent elements the server kept its own row for (its version was not lower), as stored now. */
  stale: StoredElement[]
}

const DEFAULT_SHEET_NAME = "Sheet 1"

type LoadedBoard = NonNullable<repo.BoardRow>

function notFound(): NotFoundError {
  return new NotFoundError("Board not found")
}

function boardDto(board: LoadedBoard): BoardDto {
  return {
    id: board.id,
    title: board.title,
    updatedAt: board.updatedAt.toISOString(),
    sheets: board.sheets.map((s) => ({ id: s.id, name: s.name, rev: s.rev })),
  }
}

function storedElement(row: { elementId: string; version: number; deleted: boolean; data: unknown }): StoredElement {
  return { id: row.elementId, version: row.version, deleted: row.deleted, data: row.deleted ? {} : row.data }
}

/** The live board of this project, or 404. */
async function liveBoard(db: Db, projectId: string, boardId: string): Promise<LoadedBoard> {
  const board = await repo.findBoard(db, projectId, boardId)
  if (!board || board.deletedAt !== null) throw notFound()
  return board
}

/** liveBoard under the board's row lock (for changes of the sheet list). */
async function lockedBoard(tx: Db, projectId: string, boardId: string): Promise<LoadedBoard> {
  await repo.lockBoard(tx, boardId)
  return liveBoard(tx, projectId, boardId)
}

async function assertBoardSlot(db: Db, projectId: string): Promise<void> {
  // A soft bound: two creates at the same instant may both pass (no project-wide lock is taken for it).
  if ((await repo.countLiveBoards(db, projectId)) >= BOARD_LIMITS.boardsPerProject) {
    throw new ConflictError("Board limit reached", { limit: BOARD_LIMITS.boardsPerProject }, "BOARD_LIMIT_REACHED")
  }
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** GET /boards (`trashed`: the boards in the trash instead of the live ones). */
export async function listBoards(projectId: string, opts: { trashed?: boolean } = {}): Promise<BoardListDto> {
  const trashed = opts.trashed === true
  const rows = await repo.findBoards(defaultDb, projectId, trashed, BOARD_LIMITS.boardsPerProject)
  const names = trashed ? await repo.findUserNames(defaultDb, rows.flatMap((r) => (r.deletedById ? [r.deletedById] : []))) : new Map<string, string>()
  return {
    limit: BOARD_LIMITS.boardsPerProject,
    boards: rows.map((r) => ({
      id: r.id,
      title: r.title,
      sheetCount: r._count.sheets,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      deletedBy: r.deletedById ? { id: r.deletedById, name: names.get(r.deletedById) ?? null } : null,
    })),
  }
}

/** POST /boards: a board with its first sheet. */
export async function createBoard(projectId: string, input: CreateBoardInput, actor: Actor): Promise<BoardDto> {
  return withTransaction(async (tx) => {
    await assertBoardSlot(tx, projectId)
    const board = await repo.createBoard(tx, { projectId, title: input.title, createdById: actor.userId, sheetName: input.sheetName ?? DEFAULT_SHEET_NAME })
    return boardDto(board)
  })
}

/** GET /boards/[boardId]. */
export async function getBoard(projectId: string, boardId: string): Promise<BoardDto> {
  return boardDto(await liveBoard(defaultDb, projectId, boardId))
}

/** PATCH /boards/[boardId]: rename. */
export async function renameBoard(projectId: string, boardId: string, input: UpdateBoardInput): Promise<BoardDto> {
  return withTransaction(async (tx) => {
    const board = await liveBoard(tx, projectId, boardId)
    const updated = await repo.updateBoard(tx, boardId, { title: input.title })
    return boardDto({ ...board, ...updated })
  })
}

/** DELETE /boards/[boardId]: to the trash (sheets and elements are kept). */
export async function deleteBoard(projectId: string, boardId: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    await liveBoard(tx, projectId, boardId)
    await repo.updateBoard(tx, boardId, softDeleteData(actor.userId))
  })
}

/** POST /boards/[boardId]/restore: out of the trash. 404 when it is not in this project's trash. */
export async function restoreBoard(projectId: string, boardId: string): Promise<BoardDto> {
  return withTransaction(async (tx) => {
    const board = await repo.findBoard(tx, projectId, boardId)
    if (!board || board.deletedAt === null) throw notFound()
    await assertBoardSlot(tx, projectId)
    const updated = await repo.updateBoard(tx, boardId, { ...RESTORE_DATA })
    return boardDto({ ...board, ...updated })
  })
}

/** Permanent delete of a board in the trash (the purge job). 404 when it is not in the trash. */
export async function purgeBoard(projectId: string, boardId: string): Promise<void> {
  const { count } = await repo.deleteTrashedBoard(defaultDb, projectId, boardId)
  if (count === 0) throw notFound()
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function findSheetOf(board: LoadedBoard, sheetId: string) {
  const sheet = board.sheets.find((s) => s.id === sheetId)
  if (!sheet) throw new NotFoundError("Sheet not found")
  return sheet
}

function assertSheetSlot(board: LoadedBoard): void {
  if (board.sheets.length >= BOARD_LIMITS.sheetsPerBoard) {
    throw new ConflictError("Sheet limit reached", { limit: BOARD_LIMITS.sheetsPerBoard }, "BOARD_SHEET_LIMIT_REACHED")
  }
}

/** Writes 0..n-1 as the tab order of `sheetIds` (only the rows whose position changes). */
async function writeOrder(tx: Db, current: ReadonlyArray<{ id: string; sortOrder: number }>, sheetIds: readonly string[]): Promise<void> {
  const before = new Map(current.map((s) => [s.id, s.sortOrder]))
  for (const [index, id] of sheetIds.entries()) {
    if (before.get(id) !== index) await repo.setSheetOrder(tx, id, index)
  }
}

async function reloaded(tx: Db, projectId: string, boardId: string): Promise<BoardDto> {
  const touched = await repo.touchBoard(tx, boardId)
  return boardDto(await liveBoard(tx, projectId, touched.id))
}

/** POST /boards/[boardId]/sheets: a new empty sheet at the end. */
export async function addSheet(projectId: string, boardId: string, input: SheetNameInput): Promise<SheetCreatedDto> {
  return withTransaction(async (tx) => {
    const board = await lockedBoard(tx, projectId, boardId)
    assertSheetSlot(board)
    const last = board.sheets.reduce((max, s) => Math.max(max, s.sortOrder), -1)
    const sheet = await repo.createSheet(tx, { boardId, name: input.name, sortOrder: last + 1 })
    return { board: await reloaded(tx, projectId, boardId), sheetId: sheet.id }
  })
}

/** PATCH /boards/[boardId]/sheets/[sheetId]: rename. */
export async function renameSheet(projectId: string, boardId: string, sheetId: string, input: SheetNameInput): Promise<BoardDto> {
  return withTransaction(async (tx) => {
    const board = await lockedBoard(tx, projectId, boardId)
    findSheetOf(board, sheetId)
    await repo.renameSheet(tx, sheetId, input.name)
    return reloaded(tx, projectId, boardId)
  })
}

/** DELETE /boards/[boardId]/sheets/[sheetId]: permanent, with its elements. A board keeps at least one sheet. */
export async function deleteSheet(projectId: string, boardId: string, sheetId: string): Promise<BoardDto> {
  return withTransaction(async (tx) => {
    const board = await lockedBoard(tx, projectId, boardId)
    findSheetOf(board, sheetId)
    if (board.sheets.length <= 1) throw new ConflictError("A board keeps at least one sheet", {}, "BOARD_LAST_SHEET")
    await repo.deleteSheet(tx, sheetId)
    await writeOrder(tx, board.sheets, board.sheets.filter((s) => s.id !== sheetId).map((s) => s.id))
    return reloaded(tx, projectId, boardId)
  })
}

/**
 * POST /boards/[boardId]/sheets/[sheetId]/duplicate: a copy of the sheet right after it, with its live
 * elements (same element ids, so arrows stay attached; versions start again at 1).
 */
export async function duplicateSheet(projectId: string, boardId: string, sheetId: string, input: SheetNameInput, actor: Actor): Promise<SheetCreatedDto> {
  return withTransaction(async (tx) => {
    const board = await lockedBoard(tx, projectId, boardId)
    const source = findSheetOf(board, sheetId)
    assertSheetSlot(board)
    const elements = await repo.findLiveElements(tx, sheetId)
    const copy = await repo.createSheet(tx, { boardId, name: input.name, sortOrder: source.sortOrder, rev: elements.length > 0 ? 1 : 0 })
    const order = board.sheets.flatMap((s) => (s.id === sheetId ? [s.id, copy.id] : [s.id]))
    await writeOrder(tx, [...board.sheets, { id: copy.id, sortOrder: -1 }], order)
    await repo.insertElements(
      tx,
      copy.id,
      elements.map((e) => ({ elementId: e.elementId, version: 1, deleted: false, data: e.data as Prisma.InputJsonObject, rev: 1, updatedById: actor.userId }))
    )
    return { board: await reloaded(tx, projectId, boardId), sheetId: copy.id }
  })
}

/** PUT /boards/[boardId]/sheets/order: `sheetIds` must name every sheet of the board exactly once. */
export async function reorderSheets(projectId: string, boardId: string, input: ReorderSheetsInput): Promise<BoardDto> {
  return withTransaction(async (tx) => {
    const board = await lockedBoard(tx, projectId, boardId)
    const known = new Set(board.sheets.map((s) => s.id))
    const sent = new Set(input.sheetIds)
    const permutation = input.sheetIds.length === known.size && sent.size === known.size && input.sheetIds.every((id) => known.has(id))
    if (!permutation) throw new ValidationError("sheetIds must list every sheet of the board once")
    await writeOrder(tx, board.sheets, input.sheetIds)
    return reloaded(tx, projectId, boardId)
  })
}

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

/**
 * GET …/sheets/[sheetId]/elements: every live element, or with `since` only what was written after that
 * revision (deleted elements included, as `{ deleted: true }`).
 *
 * The revision is read before the rows: a write landing in between is then part of the rows but not of
 * `rev`, so the next delta read returns it again (harmless) instead of missing it.
 */
export async function readElements(projectId: string, boardId: string, sheetId: string, since?: number): Promise<ElementsDto> {
  await liveBoard(defaultDb, projectId, boardId)
  const sheet = await repo.findSheetRev(defaultDb, boardId, sheetId)
  if (!sheet) throw new NotFoundError("Sheet not found")
  const rows = since === undefined ? await repo.findLiveElements(defaultDb, sheetId) : await repo.findElementsSince(defaultDb, sheetId, since)
  return { rev: sheet.rev, full: since === undefined, elements: rows.map(storedElement) }
}

/**
 * POST …/sheets/[sheetId]/elements: stores the changed elements a client sends.
 *
 * Under the sheet's row lock: per element the higher version stays (src/lib/board/merge.ts). What is
 * stored gets the sheet's next revision; what the server kept its own row for comes back in `stale`.
 * A repeated request (same versions, same content) stores nothing and answers the current revision.
 */
export async function writeElements(projectId: string, boardId: string, sheetId: string, input: WriteElementsInput, actor: Actor): Promise<WriteResultDto> {
  return withTransaction(
    async (tx) => {
      await liveBoard(tx, projectId, boardId)
      const sheet = await repo.lockSheet(tx, boardId, sheetId)
      if (!sheet) throw new NotFoundError("Sheet not found")

      const rows = await repo.findElementsByIds(tx, sheetId, input.elements.map((e) => e.id))
      const stored = new Map(rows.map((r) => [r.elementId, r]))
      const plan = planMerge(stored as ReadonlyMap<string, ExistingElement>, input.elements)
      const stale = plan.stale.flatMap((id) => {
        const row = stored.get(id)
        return row ? [storedElement(row)] : []
      })
      if (plan.apply.length === 0) return { rev: sheet.rev, applied: 0, stale }

      if (plan.liveDelta > 0) {
        const live = await repo.countLiveElements(tx, sheetId)
        if (live + plan.liveDelta > BOARD_LIMITS.elementsPerSheet) {
          throw new ConflictError("The sheet is full", { limit: BOARD_LIMITS.elementsPerSheet }, "BOARD_SHEET_FULL")
        }
      }

      const rev = sheet.rev + 1
      await repo.replaceElements(
        tx,
        sheetId,
        plan.apply.map((write) => ({
          elementId: write.id,
          version: write.version,
          deleted: write.deleted === true,
          // A deleted element keeps no content: only that it is gone, and at which version.
          data: write.deleted === true ? {} : (write.data as Prisma.InputJsonObject),
          rev,
          updatedById: actor.userId,
          createdAt: stored.get(write.id)?.createdAt,
        }))
      )
      await repo.setSheetRev(tx, sheetId, rev)
      await repo.touchBoard(tx, boardId)
      return { rev, applied: plan.apply.length, stale }
    },
    { isolationLevel: "ReadCommitted" }
  )
}
