import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"

export function findEvents(db: Db, projectId: string) {
  return db.calendarEvent.findMany({
    where: { projectId },
    orderBy: { date: "asc" },
    take: LIST_LIMITS.calendarEvents,
  })
}

export function insertEvent(db: Db, data: Prisma.CalendarEventUncheckedCreateInput) {
  return db.calendarEvent.create({ data })
}

export function updateEvent(db: Db, projectId: string, eventId: string, data: Prisma.CalendarEventUncheckedUpdateInput) {
  return db.calendarEvent.update({ where: { id: eventId, projectId }, data })
}

export function deleteEvent(db: Db, projectId: string, eventId: string) {
  return db.calendarEvent.delete({ where: { id: eventId, projectId } })
}

/** Sprint id if it exists inside the project, else null (cross-project guard). */
export function findProjectSprintId(db: Db, projectId: string, sprintId: string) {
  return db.sprint.findFirst({ where: { id: sprintId, projectId }, select: { id: true } })
}
