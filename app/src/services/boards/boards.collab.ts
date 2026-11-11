import type { Prisma } from "@/generated/prisma/client"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { resolveMentionUserIds } from "@/lib/mentions"
import { logger } from "@/lib/logger"
import { ollamaGenerate } from "@/lib/ollama"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ConflictError, ForbiddenError, NotFoundError } from "@/services/_shared/errors"
import { notify } from "@/services/_shared/notifications"
import { findMentionCandidates } from "@/services/comments/comments.repository"
import * as repo from "./boards.repository"
import { parseGroups } from "@/lib/board/ai-groups"
import { elementFromData, type BoardElement } from "@/lib/board/model"
import { shapeContext, shapeContextLines } from "@/lib/board/pbi-context"
import * as collab from "./boards.collab.repository"
import type { AiAssistInput, CreateCommentInput, PresenceInput, SaveVersionInput } from "./boards.collab.schemas"

/**
 * The White Board's working-together parts (B7): who has a sheet open, the history of a sheet (saved versions,
 * restore), comments with @mentions, the backlog items (PBIs) boxes stand for, and the local-LLM assist.
 *
 * Authorization is decided in the routes; every function is scoped to the project and answers 404 for a board of
 * another project or in the trash. Board content stays inside Kanflow: the assist sends the texts the person
 * selected to the local Ollama only, when that person asks (never a background job, never MCP / GitStation).
 */

const log = logger.child({ module: "boards.collab" })

/** Someone counts as "here" when seen within this many milliseconds. */
export const PRESENCE_WINDOW_MS = 20_000
/** At most one automatic version per sheet in this many milliseconds. */
export const AUTO_VERSION_EVERY_MS = 10 * 60_000
/** A sheet larger than this (JSON characters) is not kept as a version. */
const AUTO_VERSION_MAX_CHARS = BOARD_LIMITS.versionChars

export interface ViewerDto {
  userId: string
  name: string
  selection: string[]
}

export interface VersionDto {
  id: string
  label: string
  auto: boolean
  elementCount: number
  createdAt: string
  createdBy: string
}

export interface CommentDto {
  id: string
  sheetId: string
  elementId: string | null
  author: { id: string; name: string }
  body: string
  createdAt: string
  resolved: boolean
}

export interface PbiSummaryDto {
  id: string
  displayId: number
  title: string
  status: string
  assignee: string | null
  confidential: boolean
}

export interface LinkedBoardDto {
  boardId: string
  boardTitle: string
  sheetId: string
  sheetName: string
  elementId: string
}

async function liveSheet(db: Db, projectId: string, boardId: string, sheetId: string): Promise<void> {
  const board = await repo.findBoard(db, projectId, boardId)
  if (!board || board.deletedAt !== null) throw new NotFoundError("Board not found")
  if (!board.sheets.some((s) => s.id === sheetId)) throw new NotFoundError("Sheet not found")
}

async function liveBoardTitle(db: Db, projectId: string, boardId: string): Promise<{ title: string; sheetIds: Set<string> }> {
  const board = await repo.findBoard(db, projectId, boardId)
  if (!board || board.deletedAt !== null) throw new NotFoundError("Board not found")
  return { title: board.title, sheetIds: new Set(board.sheets.map((s) => s.id)) }
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/** I have the sheet open (with this selected): answers who else has it open now. */
export async function heartbeat(projectId: string, boardId: string, sheetId: string, input: PresenceInput, actor: Actor): Promise<{ now: number; viewers: ViewerDto[] }> {
  await liveSheet(defaultDb, projectId, boardId, sheetId)
  await collab.upsertPresence(defaultDb, { sheetId, userId: actor.userId, userName: (actor.userName ?? "").slice(0, 120), selection: input.selection })
  // Now and then (about one call in 50), this sheet's rows of tabs closed long ago go (by the key: cheap).
  if (Math.random() < 0.02) await collab.prunePresence(defaultDb, sheetId, new Date(Date.now() - 60 * 60_000)).catch((err: unknown) => log.warn("presence prune failed", { error: String(err) }))
  const rows = await collab.findPresence(defaultDb, sheetId, new Date(Date.now() - PRESENCE_WINDOW_MS), actor.userId)
  // The server's clock: a timer started on one computer counts down alike on all (each corrects its own clock).
  return { now: Date.now(), viewers: rows.map((r) => ({ userId: r.userId, name: r.userName, selection: Array.isArray(r.selection) ? (r.selection as unknown[]).filter((v): v is string => typeof v === "string") : [] })) }
}

/** I closed the sheet. */
export async function leave(projectId: string, boardId: string, sheetId: string, actor: Actor): Promise<void> {
  await liveSheet(defaultDb, projectId, boardId, sheetId)
  await collab.deletePresence(defaultDb, sheetId, actor.userId)
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

function versionDto(row: { id: string; label: string; auto: boolean; elementCount: number; createdAt: Date; createdByName: string }): VersionDto {
  return { id: row.id, label: row.label, auto: row.auto, elementCount: row.elementCount, createdAt: row.createdAt.toISOString(), createdBy: row.createdByName }
}

/** The sheet's live elements as a version holds them. */
async function snapshotOf(db: Db, sheetId: string): Promise<{ elements: { id: string; data: unknown }[]; json: string }> {
  const rows = await repo.findLiveElements(db, sheetId)
  const elements = rows.map((r) => ({ id: r.elementId, data: r.data }))
  return { elements, json: JSON.stringify(elements) }
}

async function storeVersion(db: Db, sheetId: string, rev: number, label: string, auto: boolean, actor: Actor | null, snapshot: { elements: { id: string; data: unknown }[] }) {
  const row = await collab.createVersion(db, {
    sheetId,
    label,
    auto,
    elements: snapshot.elements as Prisma.InputJsonValue,
    elementCount: snapshot.elements.length,
    rev,
    createdById: actor?.userId ?? null,
    createdByName: (actor?.userName ?? "").slice(0, 120),
  })
  await collab.trimVersions(db, sheetId, BOARD_LIMITS.versionsPerSheet)
  return row
}

/**
 * After a write: keeps an automatic version when the last one is older than AUTO_VERSION_EVERY_MS (or there is none
 * and the sheet has content). Best effort — a failure is logged and never fails the write.
 */
export async function autoVersion(boardId: string, sheetId: string, actor: Actor): Promise<boolean> {
  try {
    // Cheap check first (most writes stop here), then under the sheet's lock again: two writers never both keep one,
    // and the version holds exactly the sheet at the revision stored with it.
    const seen = await collab.latestVersion(defaultDb, sheetId)
    if (seen && Date.now() - seen.createdAt.getTime() < AUTO_VERSION_EVERY_MS) return false
    return await withTransaction(
      async (tx) => {
        const sheet = await repo.lockSheet(tx, boardId, sheetId)
        if (!sheet) return false
        const last = await collab.latestVersion(tx, sheetId)
        if (last && Date.now() - last.createdAt.getTime() < AUTO_VERSION_EVERY_MS) return false
        const snapshot = await snapshotOf(tx, sheetId)
        if (snapshot.elements.length === 0) return false
        if (snapshot.json.length > AUTO_VERSION_MAX_CHARS) {
          log.warn("sheet too large for an automatic version", { sheetId, chars: snapshot.json.length })
          return false
        }
        await storeVersion(tx, sheetId, sheet.rev, "", true, actor, snapshot)
        return true
      },
      { isolationLevel: "ReadCommitted" },
    )
  } catch (err) {
    log.warn("automatic version failed", { sheetId, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

export async function listVersions(projectId: string, boardId: string, sheetId: string): Promise<{ versions: VersionDto[] }> {
  await liveSheet(defaultDb, projectId, boardId, sheetId)
  const rows = await collab.listVersions(defaultDb, sheetId, BOARD_LIMITS.versionsPerSheet + 20)
  return { versions: rows.map(versionDto) }
}

/** Saves the sheet now under a name: at most BOARD_LIMITS.namedVersionsPerSheet per sheet, each at most versionChars. */
export async function saveVersion(projectId: string, boardId: string, sheetId: string, input: SaveVersionInput, actor: Actor): Promise<VersionDto> {
  return withTransaction(
    async (tx) => {
      await liveSheet(tx, projectId, boardId, sheetId)
      const sheet = await repo.lockSheet(tx, boardId, sheetId)
      if (!sheet) throw new NotFoundError("Sheet not found")
      if ((await collab.countNamedVersions(tx, sheetId)) >= BOARD_LIMITS.namedVersionsPerSheet) {
        throw new ConflictError("Named version limit reached", { limit: BOARD_LIMITS.namedVersionsPerSheet }, "BOARD_VERSION_LIMIT")
      }
      const snapshot = await snapshotOf(tx, sheetId)
      if (snapshot.json.length > AUTO_VERSION_MAX_CHARS) throw new ConflictError("The sheet is too large to keep as a version", { limit: AUTO_VERSION_MAX_CHARS }, "BOARD_WRITE_TOO_LARGE")
      return versionDto(await storeVersion(tx, sheetId, sheet.rev, input.label, false, actor, snapshot))
    },
    { isolationLevel: "ReadCommitted" },
  )
}

/** One version with its elements (to look at it before restoring). */
export async function getVersion(projectId: string, boardId: string, sheetId: string, versionId: string): Promise<VersionDto & { elements: { id: string; data: unknown }[] }> {
  await liveSheet(defaultDb, projectId, boardId, sheetId)
  const row = await collab.findVersion(defaultDb, sheetId, versionId)
  if (!row) throw new NotFoundError("Version not found")
  return { ...versionDto(row), elements: Array.isArray(row.elements) ? (row.elements as { id: string; data: unknown }[]) : [] }
}

/**
 * Puts the sheet back to a version, as one ordinary write: every element of the version comes back (one version
 * above what is stored, so every open editor takes it), every live element not in it is deleted. The state before
 * is saved as an automatic version first, so a restore can itself be undone.
 */
export async function restoreVersion(projectId: string, boardId: string, sheetId: string, versionId: string, actor: Actor): Promise<{ rev: number; restored: number; removed: number }> {
  return withTransaction(
    async (tx) => {
      await repo.lockBoard(tx, boardId)
      await liveSheet(tx, projectId, boardId, sheetId)
      const sheet = await repo.lockSheet(tx, boardId, sheetId)
      if (!sheet) throw new NotFoundError("Sheet not found")
      const version = await collab.findVersion(tx, sheetId, versionId)
      if (!version) throw new NotFoundError("Version not found")
      const target = Array.isArray(version.elements) ? (version.elements as { id: string; data: unknown }[]) : []
      if (target.length > BOARD_LIMITS.elementsPerSheet) throw new ConflictError("The sheet is full", { limit: BOARD_LIMITS.elementsPerSheet }, "BOARD_SHEET_FULL")

      const before = await snapshotOf(tx, sheetId)
      if (before.elements.length > 0 && before.json.length <= AUTO_VERSION_MAX_CHARS) await storeVersion(tx, sheetId, sheet.rev, "", true, actor, before)

      const ids = new Set(target.map((e) => e.id))
      const live = new Set(before.elements.map((e) => e.id))
      const existing = await repo.findElementsByIds(tx, sheetId, [...new Set([...ids, ...live])])
      const stored = new Map(existing.map((r) => [r.elementId, r]))
      const rev = sheet.rev + 1
      const writes = [
        ...target.map((e) => ({
          elementId: e.id,
          version: (stored.get(e.id)?.version ?? 0) + 1,
          deleted: false,
          data: e.data as Prisma.InputJsonObject,
          rev,
          updatedById: actor.userId,
          createdAt: stored.get(e.id)?.createdAt,
        })),
        ...[...live]
          .filter((id) => !ids.has(id))
          .map((id) => ({ elementId: id, version: (stored.get(id)?.version ?? 0) + 1, deleted: true, data: {} as Prisma.InputJsonObject, rev, updatedById: actor.userId, createdAt: stored.get(id)?.createdAt })),
      ]
      if (writes.length > 0) {
        await repo.replaceElements(tx, sheetId, writes)
        await repo.setSheetRev(tx, sheetId, rev)
        await repo.touchBoard(tx, boardId)
      }
      return { rev: writes.length > 0 ? rev : sheet.rev, restored: target.length, removed: writes.length - target.length }
    },
    { isolationLevel: "ReadCommitted" },
  )
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

async function commentDtos(db: Db, rows: Awaited<ReturnType<typeof collab.listComments>>): Promise<CommentDto[]> {
  const names = new Map((await collab.findUserNames(db, [...new Set(rows.map((r) => r.authorId))])).map((u) => [u.id, u.name]))
  return rows.map((r) => ({
    id: r.id,
    sheetId: r.sheetId,
    elementId: r.elementId,
    author: { id: r.authorId, name: names.get(r.authorId) ?? "" },
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    resolved: r.resolvedAt !== null,
  }))
}

export async function listComments(projectId: string, boardId: string): Promise<{ comments: CommentDto[] }> {
  await liveBoardTitle(defaultDb, projectId, boardId)
  return { comments: await commentDtos(defaultDb, await collab.listComments(defaultDb, boardId, BOARD_LIMITS.commentsPerBoard)) }
}

/** Adds a comment; the people @mentioned in it are notified (a link back to the sheet and the element). */
export async function createComment(projectId: string, boardId: string, input: CreateCommentInput, actor: Actor): Promise<CommentDto> {
  return withTransaction(async (tx) => {
    await repo.lockBoard(tx, boardId)
    const board = await liveBoardTitle(tx, projectId, boardId)
    if (!board.sheetIds.has(input.sheetId)) throw new NotFoundError("Sheet not found")
    if ((await collab.countComments(tx, boardId)) >= BOARD_LIMITS.commentsPerBoard) {
      throw new ConflictError("Comment limit reached", { limit: BOARD_LIMITS.commentsPerBoard }, "BOARD_COMMENT_LIMIT")
    }
    const row = await collab.createComment(tx, { boardId, sheetId: input.sheetId, elementId: input.elementId, authorId: actor.userId, body: input.body })
    const members = await findMentionCandidates(tx, projectId)
    const mentioned = resolveMentionUserIds(input.body, members, actor.userId)
    if (mentioned.length > 0) {
      await notify(tx, {
        recipientIds: mentioned,
        type: "mentioned",
        actorId: actor.userId,
        projectId,
        entityType: "board",
        entityId: boardId,
        // The board's title names it in the sentence; no comment text is copied into the notification.
        payload: { actorName: actor.userName ?? "", entityLabel: board.title, entityType: "board", entityId: boardId, sheetId: input.sheetId, elementId: input.elementId ?? undefined },
      })
    }
    const [dto] = await commentDtos(tx, [row])
    return dto
  })
}

export async function resolveComment(projectId: string, boardId: string, commentId: string, resolved: boolean, actor: Actor): Promise<CommentDto> {
  await liveBoardTitle(defaultDb, projectId, boardId)
  const row = await collab.findComment(defaultDb, boardId, commentId)
  if (!row) throw new NotFoundError("Comment not found")
  const [dto] = await commentDtos(defaultDb, [await collab.setCommentResolved(defaultDb, commentId, resolved ? actor.userId : null)])
  return dto
}

/** Deletes a comment: its author, or someone who manages boards (`canManage`). */
export async function deleteComment(projectId: string, boardId: string, commentId: string, actor: Actor, canManage: boolean): Promise<void> {
  await liveBoardTitle(defaultDb, projectId, boardId)
  const row = await collab.findComment(defaultDb, boardId, commentId)
  if (!row) throw new NotFoundError("Comment not found")
  if (row.authorId !== actor.userId && !canManage) throw new ForbiddenError("Only the author can delete this comment")
  await collab.deleteComment(defaultDb, commentId)
}

// ---------------------------------------------------------------------------
// Backlog items (PBIs)
// ---------------------------------------------------------------------------

function pbiDto(row: Awaited<ReturnType<typeof collab.findBacklogItems>>[number]): PbiSummaryDto {
  const title = (row.initiative?.trim() || row.userStory?.trim() || "").split(/\r?\n/, 1)[0].slice(0, 120)
  return { id: row.id, displayId: row.displayId, title, status: row.status, assignee: row.assignedPo, confidential: row.confidential }
}

/** What the boxes of a board show of their backlog items (read live; a deleted item is simply absent). */
export async function pbiSummaries(projectId: string, boardId: string, ids: readonly string[]): Promise<{ items: PbiSummaryDto[] }> {
  await liveBoardTitle(defaultDb, projectId, boardId)
  if (ids.length === 0) return { items: [] }
  return { items: (await collab.findBacklogItems(defaultDb, projectId, ids)).map(pbiDto) }
}

export async function searchPbis(projectId: string, query: string): Promise<{ items: PbiSummaryDto[] }> {
  return { items: (await collab.searchBacklogItems(defaultDb, projectId, query.slice(0, 100), 20)).map(pbiDto) }
}

/** The boards (sheets, elements) that stand for a backlog item: shown in the item's detail. */
export async function boardsOfPbi(projectId: string, pbiId: string): Promise<{ links: LinkedBoardDto[] }> {
  const rows = await collab.findElementsOfPbi(defaultDb, projectId, pbiId, 20)
  return { links: rows.map((r) => ({ boardId: r.sheet.board.id, boardTitle: r.sheet.board.title, sheetId: r.sheet.id, sheetName: r.sheet.name, elementId: r.elementId })) }
}

// ---------------------------------------------------------------------------
// PBI drafts from a shape
// ---------------------------------------------------------------------------

/**
 * The source section of a PBI-draft prompt for one shape: its text and its surroundings on the sheet as stored
 * (arrows, frame, group, same frame, open comments). Null when the shape has no words at all.
 */
export async function shapeDraftSource(projectId: string, boardId: string, sheetId: string, elementId: string): Promise<string[] | null> {
  const board = await repo.findBoard(defaultDb, projectId, boardId)
  if (!board || board.deletedAt !== null) throw new NotFoundError("Board not found")
  const sheet = board.sheets.find((s) => s.id === sheetId)
  if (!sheet) throw new NotFoundError("Sheet not found")
  const elements: Record<string, BoardElement> = {}
  for (const row of await repo.findLiveElements(defaultDb, sheetId)) elements[row.elementId] = elementFromData(row.elementId, row.data)
  if (!elements[elementId]) throw new NotFoundError("Element not found")
  const comments = (await collab.listComments(defaultDb, boardId, BOARD_LIMITS.commentsPerBoard))
    .filter((c) => c.sheetId === sheetId)
    .map((c) => ({ elementId: c.elementId, body: c.body, resolved: c.resolvedAt !== null }))
  const context = shapeContext(elements, elementId, comments)
  if (!context || !context.text) return null
  return shapeContextLines(context, board.title, sheet.name)
}

// ---------------------------------------------------------------------------
// Local-LLM assist
// ---------------------------------------------------------------------------

const LANGUAGE_NAME = { ja: "Japanese", en: "English", id: "Indonesian" } as const

/** The texts as a numbered list for the prompt (each on one line). */
function numbered(texts: readonly string[]): string {
  return texts.map((text, i) => `${i + 1}. ${text.replace(/\s+/g, " ")}`).join("\n")
}

/**
 * Summarizes or groups the selected sticky notes with the local LLM, on the person's request. Throws an Ollama error
 * when the model cannot be reached (the route says so; the board works on without it).
 */
export async function aiAssist(projectId: string, boardId: string, input: AiAssistInput, signal?: AbortSignal): Promise<{ summary?: string; groups?: { title: string; items: number[] }[] }> {
  await liveBoardTitle(defaultDb, projectId, boardId)
  const language = LANGUAGE_NAME[input.language]
  const notes = numbered(input.texts)
  if (input.action === "summarize") {
    const summary = await ollamaGenerate(
      `Summarize the following sticky notes from a team whiteboard in ${language}: at most 5 short bullet points ("- "), then one line starting with "→" that says what to do next. Use only what the notes say.\n\nNotes:\n${notes}`,
      { label: "board.summarize", signal, timeoutMs: 60_000, temperature: 0.2 },
    )
    return { summary: summary.trim().slice(0, BOARD_LIMITS.textLength) }
  }
  const raw = await ollamaGenerate(
    `Group the following sticky notes by theme (2 to 6 groups). Answer with JSON only: [{"title": "<short theme in ${language}>", "items": [<note numbers>]}]. Every note number in exactly one group.\n\nNotes:\n${notes}`,
    { label: "board.group", signal, timeoutMs: 60_000, temperature: 0.1 },
  )
  const groups = parseGroups(raw, input.texts.length, input.language === "ja" ? "その他" : input.language === "id" ? "Lainnya" : "Other")
  if (!groups) throw new ConflictError("The model's answer could not be read", {}, "BOARD_AI_UNREADABLE")
  return { groups }
}
