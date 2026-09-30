import type { Prisma } from "@/generated/prisma/client"
import type { Actor } from "@/services/_shared/actor"
import { parseDateOrThrow } from "@/services/_shared/dates"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { attachI18n, attachI18nOne, enqueueIn, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./daily-scrums.repository"
import type { CreateDailyScrumInput, UpdateDailyScrumInput } from "./daily-scrums.schemas"

export async function listNotes(projectId: string, sprintId: string) {
  if (!(await repo.findSprintId(defaultDb, projectId, sprintId))) throw new NotFoundError("Not found", {}, "SPRINT_NOT_FOUND")
  return attachI18n("daily_scrum_note", await repo.findNotes(defaultDb, sprintId))
}

export async function createNote(projectId: string, sprintId: string, input: CreateDailyScrumInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  if (!(await repo.findSprintId(defaultDb, projectId, sprintId))) throw new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND")
  const date = parseDateOrThrow(data.date)
  return withTransaction(async (tx) => {
    const note = await repo.insertNote(tx, { sprintId, date, content: data.content, author: actor.userName })
    await enqueueIn(tx, "daily_scrum_note", note.id, note)
    return note
  })
}

/** Pure: PATCH payload (archived → archivedAt timestamp / null). */
export function buildNoteUpdate(data: UpdateDailyScrumInput): Prisma.DailyScrumNoteUncheckedUpdateInput {
  return {
    ...(data.content !== undefined ? { content: data.content } : {}),
    ...(data.date !== undefined ? { date: parseDateOrThrow(data.date) } : {}),
    ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
  }
}

export async function updateNote(
  projectId: string,
  sprintId: string,
  noteId: string,
  input: UpdateDailyScrumInput,
  actor: Actor
) {
  if (!(await repo.findNoteId(defaultDb, projectId, sprintId, noteId))) throw new NotFoundError()
  const data = await prepareText(input, actor.userId)
  const patch = buildNoteUpdate(data)
  const note = await withTransaction(async (tx) => {
    const updated = await repo.updateNote(tx, noteId, patch)
    await enqueueIn(tx, "daily_scrum_note", updated.id, { content: data.content })
    return updated
  })
  return attachI18nOne("daily_scrum_note", note)
}

export async function deleteNote(projectId: string, sprintId: string, noteId: string): Promise<void> {
  await withTransaction(async (tx) => {
    if (!(await repo.findNoteId(tx, projectId, sprintId, noteId))) throw new NotFoundError()
    await repo.deleteNote(tx, noteId)
    await purgeIn(tx, { daily_scrum_note: [noteId] })
  })
}
