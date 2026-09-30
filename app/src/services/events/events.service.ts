import type { Prisma } from "@/generated/prisma/client"
import type { Actor } from "@/services/_shared/actor"
import { optionalDate, parseDateOrThrow } from "@/services/_shared/dates"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { attachI18n, attachI18nOne, enqueueIn, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./events.repository"
import type { CreateEventInput, UpdateEventInput } from "./events.schemas"

const SPRINT_MISSING = "Sprint not found"

/**
 * A linked sprint must belong to the same project (404 otherwise, like the
 * other cross-project checks). Empty / null / undefined = no link, nothing to verify.
 */
async function assertSprintInProject(db: Db, projectId: string, sprintId: string | null | undefined): Promise<void> {
  if (!sprintId) return
  if (!(await repo.findProjectSprintId(db, projectId, sprintId))) throw new NotFoundError(SPRINT_MISSING, {}, "SPRINT_NOT_FOUND")
}

export async function listEvents(projectId: string) {
  return attachI18n("calendar_event", await repo.findEvents(defaultDb, projectId))
}

export async function createEvent(projectId: string, input: CreateEventInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const date = parseDateOrThrow(data.date)
  return withTransaction(async (tx) => {
    await assertSprintInProject(tx, projectId, data.sprintId)
    const event = await repo.insertEvent(tx, {
      projectId,
      title: data.title,
      description: data.description,
      date,
      endDate: data.endDate ? new Date(data.endDate) : null,
      color: data.color ?? "blue",
      allDay: data.allDay ?? true,
      sprintId: data.sprintId || null,
      createdBy: actor.userName,
    })
    await enqueueIn(tx, "calendar_event", event.id, event)
    return event
  })
}

/** Pure: PATCH payload ("" sprintId detaches, null / "" endDate clears). */
export function buildEventUpdate(data: UpdateEventInput): Prisma.CalendarEventUncheckedUpdateInput {
  return {
    ...data,
    ...(data.date ? { date: new Date(data.date) } : {}),
    ...(data.endDate !== undefined ? { endDate: optionalDate(data.endDate) } : {}),
    ...(data.sprintId !== undefined ? { sprintId: data.sprintId || null } : {}),
  }
}

export async function updateEvent(projectId: string, eventId: string, input: UpdateEventInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const event = await withTransaction(async (tx) => {
    await assertSprintInProject(tx, projectId, data.sprintId)
    const updated = await repo.updateEvent(tx, projectId, eventId, buildEventUpdate(data))
    await enqueueIn(tx, "calendar_event", updated.id, data)
    return updated
  })
  return attachI18nOne("calendar_event", event)
}

export async function deleteEvent(projectId: string, eventId: string): Promise<void> {
  await withTransaction(async (tx) => {
    await repo.deleteEvent(tx, projectId, eventId)
    await purgeIn(tx, { calendar_event: [eventId] })
  })
}
