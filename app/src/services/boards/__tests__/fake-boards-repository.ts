/**
 * In-memory stand-in for boards.repository.ts (test helper). It keeps the same contract — one row per
 * (sheet, element id), rows replaced on write — so the service and the routes run for real on top of it:
 *
 *   vi.mock("@/services/boards/boards.repository", async () => (await import("…/fake-boards-repository")).fakeBoardsRepository)
 *   vi.mock("@/services/_shared/db", async () => (await import("…/fake-boards-repository")).fakeDbModule)
 *
 * Synthetic data only. What needs a real database (row locks, constraints, cascades) is in boards.db.test.ts.
 */
import type { ElementRowInput } from "../boards.repository"

interface FakeBoard {
  id: string
  projectId: string
  title: string
  createdById: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  deletedById: string | null
}

interface FakeSheet {
  id: string
  boardId: string
  name: string
  sortOrder: number
  rev: number
}

interface FakeElement {
  elementId: string
  version: number
  deleted: boolean
  data: unknown
  rev: number
  updatedById: string | null
  createdAt: Date
}

const state = {
  seq: 0,
  clock: Date.parse("2026-11-01T00:00:00.000Z"),
  boards: new Map<string, FakeBoard>(),
  sheets: new Map<string, FakeSheet>(),
  elements: new Map<string, Map<string, FakeElement>>(),
  users: new Map<string, string>(),
}

/** Empties the store (call in beforeEach). */
export function resetFakeBoards(): void {
  state.seq = 0
  state.clock = Date.parse("2026-11-01T00:00:00.000Z")
  state.boards.clear()
  state.sheets.clear()
  state.elements.clear()
  state.users.clear()
}

/** Direct access for arranging and asserting. */
export const fakeBoardsState = state

function tick(): Date {
  state.clock += 1000
  return new Date(state.clock)
}

function nextId(prefix: string): string {
  state.seq += 1
  return `${prefix}-${state.seq}`
}

function sheetsOf(boardId: string) {
  return [...state.sheets.values()]
    .filter((s) => s.boardId === boardId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder, rev: s.rev }))
}

function boardFields(b: FakeBoard) {
  return { id: b.id, projectId: b.projectId, title: b.title, createdAt: b.createdAt, updatedAt: b.updatedAt, deletedAt: b.deletedAt, deletedById: b.deletedById }
}

function elementFields(e: FakeElement) {
  return { elementId: e.elementId, version: e.version, deleted: e.deleted, data: e.data, rev: e.rev, createdAt: e.createdAt }
}

function rowsOf(sheetId: string): Map<string, FakeElement> {
  let rows = state.elements.get(sheetId)
  if (!rows) {
    rows = new Map()
    state.elements.set(sheetId, rows)
  }
  return rows
}

function mustBoard(boardId: string): FakeBoard {
  const board = state.boards.get(boardId)
  if (!board) throw new Error(`fake: no board ${boardId}`)
  return board
}

function mustSheet(sheetId: string): FakeSheet {
  const sheet = state.sheets.get(sheetId)
  if (!sheet) throw new Error(`fake: no sheet ${sheetId}`)
  return sheet
}

export const fakeBoardsRepository = {
  async findBoards(_db: unknown, projectId: string, trashed: boolean, take: number) {
    return [...state.boards.values()]
      .filter((b) => b.projectId === projectId && (b.deletedAt !== null) === trashed)
      .sort((a, b) => (trashed ? b.deletedAt!.getTime() - a.deletedAt!.getTime() : b.updatedAt.getTime() - a.updatedAt.getTime()))
      .slice(0, take)
      .map((b) => ({ ...boardFields(b), _count: { sheets: sheetsOf(b.id).length } }))
  },

  async countLiveBoards(_db: unknown, projectId: string) {
    return [...state.boards.values()].filter((b) => b.projectId === projectId && b.deletedAt === null).length
  },

  async findBoard(_db: unknown, projectId: string, boardId: string) {
    const board = state.boards.get(boardId)
    if (!board || board.projectId !== projectId) return null
    return { ...boardFields(board), sheets: sheetsOf(board.id) }
  },

  async createBoard(_db: unknown, data: { projectId: string; title: string; createdById: string; sheetName: string }) {
    const now = tick()
    const board: FakeBoard = { id: nextId("board"), projectId: data.projectId, title: data.title, createdById: data.createdById, createdAt: now, updatedAt: now, deletedAt: null, deletedById: null }
    state.boards.set(board.id, board)
    const sheet: FakeSheet = { id: nextId("sheet"), boardId: board.id, name: data.sheetName, sortOrder: 0, rev: 0 }
    state.sheets.set(sheet.id, sheet)
    return { ...boardFields(board), sheets: sheetsOf(board.id) }
  },

  async updateBoard(_db: unknown, boardId: string, data: Partial<FakeBoard>) {
    const board = mustBoard(boardId)
    Object.assign(board, data, { updatedAt: tick() })
    return boardFields(board)
  },

  async touchBoard(_db: unknown, boardId: string) {
    mustBoard(boardId).updatedAt = tick()
    return { id: boardId }
  },

  async lockBoard() {},

  async findExpiredTrashedBoards(_db: unknown, cutoff: Date, take: number) {
    return [...state.boards.values()]
      .filter((b) => b.deletedAt !== null && b.deletedAt < cutoff)
      .slice(0, take)
      .map((b) => ({ id: b.id, projectId: b.projectId }))
  },

  async deleteTrashedBoard(_db: unknown, projectId: string, boardId: string) {
    const board = state.boards.get(boardId)
    if (!board || board.projectId !== projectId || board.deletedAt === null) return { count: 0 }
    for (const sheet of sheetsOf(boardId)) {
      state.sheets.delete(sheet.id)
      state.elements.delete(sheet.id)
    }
    state.boards.delete(boardId)
    return { count: 1 }
  },

  async findUserNames(_db: unknown, userIds: readonly string[]) {
    return new Map(userIds.flatMap((id) => (state.users.has(id) ? [[id, state.users.get(id)!] as const] : [])))
  },

  async createSheet(_db: unknown, data: { boardId: string; name: string; sortOrder: number; rev?: number }) {
    const sheet: FakeSheet = { id: nextId("sheet"), boardId: data.boardId, name: data.name, sortOrder: data.sortOrder, rev: data.rev ?? 0 }
    state.sheets.set(sheet.id, sheet)
    return { id: sheet.id, name: sheet.name, sortOrder: sheet.sortOrder, rev: sheet.rev }
  },

  async renameSheet(_db: unknown, sheetId: string, name: string) {
    const sheet = mustSheet(sheetId)
    sheet.name = name
    return { id: sheet.id, name: sheet.name, sortOrder: sheet.sortOrder, rev: sheet.rev }
  },

  async setSheetOrder(_db: unknown, sheetId: string, sortOrder: number) {
    mustSheet(sheetId).sortOrder = sortOrder
    return { id: sheetId }
  },

  async deleteSheet(_db: unknown, sheetId: string) {
    mustSheet(sheetId)
    state.sheets.delete(sheetId)
    state.elements.delete(sheetId)
    return { id: sheetId }
  },

  async lockSheet(_db: unknown, boardId: string, sheetId: string) {
    const sheet = state.sheets.get(sheetId)
    return sheet && sheet.boardId === boardId ? { rev: sheet.rev } : null
  },

  async findSheetRev(_db: unknown, boardId: string, sheetId: string) {
    const sheet = state.sheets.get(sheetId)
    return sheet && sheet.boardId === boardId ? { rev: sheet.rev } : null
  },

  async setSheetRev(_db: unknown, sheetId: string, rev: number) {
    mustSheet(sheetId).rev = rev
    return { id: sheetId }
  },

  async findLiveElements(_db: unknown, sheetId: string) {
    return [...rowsOf(sheetId).values()].filter((e) => !e.deleted).map(elementFields)
  },

  async findElementsSince(_db: unknown, sheetId: string, since: number) {
    return [...rowsOf(sheetId).values()]
      .filter((e) => e.rev > since)
      .sort((a, b) => a.rev - b.rev || a.elementId.localeCompare(b.elementId))
      .map(elementFields)
  },

  async findElementsByIds(_db: unknown, sheetId: string, elementIds: readonly string[]) {
    const rows = rowsOf(sheetId)
    return elementIds.flatMap((id) => (rows.has(id) ? [elementFields(rows.get(id)!)] : []))
  },

  async countLiveElements(_db: unknown, sheetId: string) {
    return [...rowsOf(sheetId).values()].filter((e) => !e.deleted).length
  },

  async replaceElements(_db: unknown, sheetId: string, rows: readonly ElementRowInput[]) {
    const stored = rowsOf(sheetId)
    for (const row of rows) stored.delete(row.elementId)
    await fakeBoardsRepository.insertElements(_db, sheetId, rows)
  },

  async insertElements(_db: unknown, sheetId: string, rows: readonly ElementRowInput[]) {
    const stored = rowsOf(sheetId)
    for (const row of rows) {
      if (stored.has(row.elementId)) throw new Error(`fake: duplicate element ${row.elementId}`)
      stored.set(row.elementId, { ...row, data: structuredClone(row.data), createdAt: row.createdAt ?? tick() })
    }
  },
}

/** `@/services/_shared/db` for tests on the fake: a transaction is just the call. */
export const fakeDbModule = {
  defaultDb: {},
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => fn({}),
}
