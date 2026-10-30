/**
 * Read queries of the public REST API (/api/v1). Every query selects an
 * explicit, stable field list (the API is a contract; internal columns such
 * as translation state or optimistic-lock versions are not exposed) and
 * applies the soft-delete filters of the UI read paths.
 */
import { afterCursorWhereAsc, OLDEST_FIRST } from "@/services/_shared/cursor"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { LIVE_PBI, notDeleted } from "@/services/_shared/soft-delete"
import { ASSIGNEES_INCLUDE } from "@/services/sprint-backlog/task-assignees"
import type { PbiStatus } from "@/services/backlog/backlog.schemas"

/** Upper bound of the project list (a user rarely sees more than a few dozen). */
export const V1_PROJECT_LIMIT = 1000

export function findMe(db: Db, userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, language: true, department: true },
  })
}

const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  projectType: true,
  progressPct: true,
  pointUnit: true,
  language: true,
  sprintDurationDays: true,
  createdAt: true,
  updatedAt: true,
} as const

export function findProjects(db: Db, where: object) {
  return db.project.findMany({
    where,
    select: PROJECT_SELECT,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: V1_PROJECT_LIMIT,
  })
}

export function findProject(db: Db, projectId: string) {
  return db.project.findFirst({
    where: notDeleted({ id: projectId }),
    select: {
      ...PROJECT_SELECT,
      sections: { select: { section: { select: { id: true, name: true } } } },
      members: { select: { role: true, user: { select: { id: true, name: true } } }, take: LIST_LIMITS.projectMembers },
    },
  })
}

export function findBacklogPage(db: Db, projectId: string, q: { status?: PbiStatus; cursor?: string; limit: number }) {
  return db.productBacklogItem.findMany({
    where: notDeleted({ projectId, ...(q.status ? { status: q.status } : {}), ...afterCursorWhereAsc(q.cursor) }),
    select: {
      id: true,
      displayId: true,
      status: true,
      initiative: true,
      epic: true,
      userStory: true,
      acceptanceCriteria: true,
      workloadScore: true,
      assignedPo: true,
      sortOrder: true,
      productGoalId: true,
      planItemId: true,
      completedAt: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: OLDEST_FIRST,
    take: q.limit + 1,
  })
}

export function findSprints(db: Db, projectId: string) {
  return db.sprint.findMany({
    where: { projectId },
    select: {
      id: true,
      sprintName: true,
      status: true,
      startDate: true,
      endDate: true,
      sprintGoal: true,
      capacity: true,
      actualScore: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: LIST_LIMITS.sprints,
  })
}

export function findSprintId(db: Db, projectId: string, sprintId: string) {
  return db.sprint.findFirst({ where: { id: sprintId, projectId }, select: { id: true } })
}

/** Tasks of the sprint whose PBI is live (tasks of trashed PBIs are hidden, as in the UI). */
export function findSprintTasks(db: Db, sprintId: string) {
  return db.sprintBacklogItem.findMany({
    where: { sprintId, ...LIVE_PBI },
    select: {
      id: true,
      taskName: true,
      status: true,
      estimatedHours: true,
      actualHours: true,
      completedAt: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      pbItem: { select: { id: true, displayId: true } },
      assignees: ASSIGNEES_INCLUDE,
    },
    orderBy: OLDEST_FIRST,
  })
}

export function findPlanItems(db: Db, projectId: string) {
  return db.planItem.findMany({
    where: { projectId, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      name: true,
      status: true,
      progressPct: true,
      plannedStart: true,
      plannedEnd: true,
      actualStart: true,
      actualEnd: true,
      isMilestone: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.planItems,
  })
}

export function findReleases(db: Db, projectId: string) {
  return db.releaseBacklogItem.findMany({
    where: { projectId },
    select: {
      id: true,
      planVersion: true,
      releaseVersion: true,
      releaseDate: true,
      status: true,
      initiative: true,
      epic: true,
      userStory: true,
      createdAt: true,
      updatedAt: true,
      pbItem: { select: { id: true, displayId: true, deletedAt: true } },
    },
    orderBy: [{ planVersion: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.releaseItems,
  })
}

/** One live PBI by id or by its project-scoped display number, with its sprint tasks. */
export function findPbi(db: Db, projectId: string, ref: { id: string } | { displayId: number }) {
  return db.productBacklogItem.findFirst({
    where: notDeleted({ projectId, ...ref }),
    select: {
      id: true,
      displayId: true,
      status: true,
      initiative: true,
      epic: true,
      userStory: true,
      acceptanceCriteria: true,
      referenceDoc: true,
      workloadScore: true,
      assignedPo: true,
      poNote: true,
      notReadyReason: true,
      sortOrder: true,
      productGoalId: true,
      planItemId: true,
      iceboxItemId: true,
      completedAt: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      sprintItems: {
        // Placeholders (taskName null) only mark the PBI as part of a sprint.
        where: { taskName: { not: null } },
        select: {
          id: true,
          sprintId: true,
          taskName: true,
          status: true,
          estimatedHours: true,
          actualHours: true,
          version: true,
          assignees: { select: { user: { select: { id: true, name: true } } } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  })
}

/** Display name of the token owner (service actor). */
export function findUserName(db: Db, userId: string) {
  return db.user.findUnique({ where: { id: userId }, select: { name: true } })
}
