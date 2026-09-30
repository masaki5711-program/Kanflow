import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"

const WITH_ITEMS_AND_PBI = { items: { include: { pbItem: true } } } as const

export function findSprints(db: Db, projectId: string) {
  return db.sprint.findMany({
    where: { projectId },
    include: {
      items: {
        include: {
          pbItem: {
            select: {
              id: true,
              displayId: true,
              initiative: true,
              userStory: true,
              epic: true,
              workloadScore: true,
              acceptanceCriteria: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: LIST_LIMITS.sprints,
  })
}

export function findSprintDetail(db: Db, projectId: string, sprintId: string) {
  return db.sprint.findFirst({ where: { id: sprintId, projectId }, include: WITH_ITEMS_AND_PBI })
}

export function findSprintId(db: Db, projectId: string, sprintId: string) {
  return db.sprint.findFirst({ where: { id: sprintId, projectId }, select: { id: true } })
}

/** A planning / active sprint blocks creating another one. */
export function findOpenSprint(db: Db, projectId: string) {
  return db.sprint.findFirst({
    where: { projectId, status: { in: ["planning", "active"] } },
    select: { id: true, sprintName: true, status: true },
  })
}

export function findProjectPbiIds(db: Db, projectId: string, pbIds: readonly string[]) {
  return db.productBacklogItem.findMany({ where: { id: { in: [...pbIds] }, projectId }, select: { id: true } })
}

/** New sprint with one placeholder task row per selected PBI. */
export function insertSprint(db: Db, data: Prisma.SprintUncheckedCreateInput, pbItemIds: readonly string[]) {
  return db.sprint.create({
    data: {
      ...data,
      items: pbItemIds.length > 0
        ? { create: pbItemIds.map((pbItemId) => ({ pbItemId, status: "todo" })) }
        : undefined,
    },
    include: WITH_ITEMS_AND_PBI,
  })
}

export function updateSprint(db: Db, projectId: string, sprintId: string, data: Prisma.SprintUncheckedUpdateInput) {
  return db.sprint.update({ where: { id: sprintId, projectId }, data, include: WITH_ITEMS_AND_PBI })
}

/** Rows that cascade with the sprint (for translation cleanup and PBI re-sync). */
export async function findSprintChildren(db: Db, sprintId: string) {
  const tasks = await db.sprintBacklogItem.findMany({ where: { sprintId }, select: { id: true, pbItemId: true } })
  const notes = await db.dailyScrumNote.findMany({ where: { sprintId }, select: { id: true } })
  return { tasks, notes }
}

export function deleteSprint(db: Db, projectId: string, sprintId: string) {
  return db.sprint.delete({ where: { id: sprintId, projectId } })
}

/** Newest non-archived sprints with only the task fields the burndown needs. */
export function findBurndownSprints(db: Db, projectId: string) {
  return db.sprint.findMany({
    where: { projectId, status: { in: ["planning", "active", "review", "done"] } },
    select: {
      id: true,
      sprintName: true,
      status: true,
      startDate: true,
      endDate: true,
      items: { select: { taskName: true, status: true, completedAt: true } },
    },
    orderBy: { startDate: "desc" },
    take: LIST_LIMITS.burndownSprints,
  })
}
