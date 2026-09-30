import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"

export function findSprintId(db: Db, projectId: string, sprintId: string) {
  return db.sprint.findFirst({ where: { id: sprintId, projectId }, select: { id: true } })
}

export function findNotes(db: Db, sprintId: string) {
  return db.dailyScrumNote.findMany({
    where: { sprintId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: LIST_LIMITS.dailyScrumNotes,
  })
}

export function insertNote(db: Db, data: { sprintId: string; date: Date; content: string; author: string | null }) {
  return db.dailyScrumNote.create({ data })
}

export function findNoteId(db: Db, projectId: string, sprintId: string, noteId: string) {
  return db.dailyScrumNote.findFirst({
    where: { id: noteId, sprintId, sprint: { projectId } },
    select: { id: true },
  })
}

export function updateNote(db: Db, noteId: string, data: Prisma.DailyScrumNoteUncheckedUpdateInput) {
  return db.dailyScrumNote.update({ where: { id: noteId }, data })
}

export function deleteNote(db: Db, noteId: string) {
  return db.dailyScrumNote.delete({ where: { id: noteId } })
}
