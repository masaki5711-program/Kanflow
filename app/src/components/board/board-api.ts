import type { StoredElement } from "@/lib/board/model"

/** Wire shapes of the boards API (see src/services/boards/boards.service.ts). */

export interface BoardPermissions {
  /** "board.write": create / rename boards, all sheet operations, element writes. */
  canWrite: boolean
  /** "board.manage": move a board to the trash, list the trash, restore. */
  canManage: boolean
}

export interface BoardSheetDto {
  id: string
  name: string
  rev: number
}

export interface BoardDto {
  id: string
  title: string
  updatedAt: string
  sheets: BoardSheetDto[]
}

export interface BoardWithPermissions extends BoardDto {
  permissions: BoardPermissions
}

export interface BoardSummaryDto {
  id: string
  title: string
  sheetCount: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  deletedBy: { id: string; name: string | null } | null
}

export interface BoardListDto {
  boards: BoardSummaryDto[]
  limit: number
  permissions: BoardPermissions
}

export interface SheetElementsDto {
  rev: number
  full: boolean
  elements: StoredElement[]
}

export interface ElementWriteResult {
  rev: number
  applied: number
  stale: StoredElement[]
}

export interface SheetCreatedDto {
  board: BoardDto
  sheetId: string
}

export function boardsUrl(projectId: string): string {
  return `/api/projects/${projectId}/boards`
}

export function boardUrl(projectId: string, boardId: string): string {
  return `${boardsUrl(projectId)}/${boardId}`
}

export function sheetUrl(projectId: string, boardId: string, sheetId: string): string {
  return `${boardUrl(projectId, boardId)}/sheets/${sheetId}`
}

/** "Sheet 3": the first free numbered name among the board's sheets. */
export function nextSheetName(template: string, existing: readonly string[]): string {
  const taken = new Set(existing)
  for (let n = existing.length + 1; n < existing.length + 1000; n++) {
    const name = template.replace("{n}", String(n))
    if (!taken.has(name)) return name
  }
  return template.replace("{n}", String(existing.length + 1))
}
