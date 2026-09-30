import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { LIVE_PBI, notDeleted } from "@/services/_shared/soft-delete"
import { BUMP_VERSION, versionWhere } from "@/services/_shared/versioning"
import { ASSIGNEES_INCLUDE } from "@/services/sprint-backlog/task-assignees"

/** Tasks of trashed PBIs keep their rows but are hidden from every sprint view. */
const WITH_ITEMS_AND_PBI = { items: { where: LIVE_PBI, include: { pbItem: true, assignees: ASSIGNEES_INCLUDE } } } as const

export function findSprints(db: Db, projectId: string) {
  return db.sprint.findMany({
    where: { projectId },
    include: {
      items: {
        where: LIVE_PBI,
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
          assignees: ASSIGNEES_INCLUDE,
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
  return db.productBacklogItem.findMany({ where: notDeleted({ id: { in: [...pbIds] }, projectId }), select: { id: true } })
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

/**
 * Optimistic-lock update: matches `version` when given and always bumps it.
 * The updated sprint (with items), or null when nothing matched (missing or
 * stale — the service tells them apart).
 */
export async function updateSprint(
  db: Db,
  projectId: string,
  sprintId: string,
  data: Prisma.SprintUncheckedUpdateInput,
  version?: number
) {
  const res = await db.sprint.updateMany({
    where: { id: sprintId, projectId, ...versionWhere(version) },
    data: { ...data, ...BUMP_VERSION },
  })
  if (res.count === 0) return null
  return db.sprint.findFirst({ where: { id: sprintId, projectId }, include: WITH_ITEMS_AND_PBI })
}

/** Rows that cascade with the sprint (for translation cleanup and PBI re-sync). */
export async function findSprintChildren(db: Db, sprintId: string) {
  const tasks = await db.sprintBacklogItem.findMany({ where: { sprintId }, select: { id: true, pbItemId: true } })
  const notes = await db.dailyScrumNote.findMany({ where: { sprintId }, select: { id: true } })
  return { tasks, notes }
}

/** Hard delete (children cascade in the DB), at `version` when given. Number of rows deleted (0 or 1). */
export async function deleteSprint(db: Db, projectId: string, sprintId: string, version?: number): Promise<number> {
  const res = await db.sprint.deleteMany({ where: { id: sprintId, projectId, ...versionWhere(version) } })
  return res.count
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
      items: { where: LIVE_PBI, select: { taskName: true, status: true, completedAt: true } },
    },
    orderBy: { startDate: "desc" },
    take: LIST_LIMITS.burndownSprints,
  })
}

/**
 * Sprints selectable in the per-sprint burndown (planning has no burn yet).
 * Archived sprints stay selectable: completing a sprint auto-archives it, and
 * its burndown must remain viewable afterwards (S-10).
 */
export const BURNDOWN_SELECTABLE_STATUSES = ["active", "review", "done", "archived"] as const

/** One sprint of the project with only the task fields the burndown needs. */
export function findBurndownSprint(db: Db, projectId: string, sprintId: string) {
  return db.sprint.findFirst({
    where: { id: sprintId, projectId, status: { in: [...BURNDOWN_SELECTABLE_STATUSES] } },
    select: {
      id: true,
      sprintName: true,
      status: true,
      startDate: true,
      endDate: true,
      items: { where: LIVE_PBI, select: { taskName: true, status: true, completedAt: true } },
    },
  })
}
