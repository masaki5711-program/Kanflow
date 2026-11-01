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
import { AC_SELECT } from "@/services/acceptance-criteria/acceptance-criteria.view"
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
      // 受入基準 items (W5), live ones in `seq` order.
      criteria: { where: { deletedAt: null }, select: AC_SELECT, orderBy: { seq: "asc" }, take: 500 },
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

// ------------------------------------------------ Kanflow MCP (/api/mcp) lookups

/** Project of a live PBI (MCP tools that start from a PBI id). */
export function findPbiProjectId(db: Db, id: string) {
  return db.productBacklogItem.findFirst({ where: notDeleted({ id }), select: { projectId: true } })
}

/** Project of a sprint. */
export function findSprintProjectId(db: Db, id: string) {
  return db.sprint.findFirst({ where: { id }, select: { projectId: true } })
}

/** Sprint and project of a task (placeholders and tasks of trashed PBIs are not tasks). */
export function findTaskLocation(db: Db, id: string) {
  return db.sprintBacklogItem.findFirst({
    where: { id, taskName: { not: null }, ...LIVE_PBI },
    select: { sprintId: true, sprint: { select: { projectId: true } } },
  })
}

/** Project of a live Icebox item. */
export function findIceboxProjectId(db: Db, id: string) {
  return db.iceboxItem.findFirst({ where: notDeleted({ id }), select: { projectId: true } })
}

/** Upper bound of projects one repository URL may resolve to. */
export const V1_REPOSITORY_MATCH_LIMIT = 50

/** Registered GitLab repositories at this location, in live projects (one row more than the limit, to detect truncation). */
export function findRepositoriesAt(db: Db, apiBase: string, repoPath: string) {
  return db.gitRepository.findMany({
    where: { apiBase, repoPath, project: { deletedAt: null } },
    select: { projectId: true, name: true, webUrl: true, project: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: V1_REPOSITORY_MATCH_LIMIT + 1,
  })
}

/** Upper bound of "my tasks" in one answer. */
export const V1_MY_TASKS_LIMIT = 200
/** Sprints whose tasks count as current work. */
export const OPEN_SPRINT_STATUSES = ["planning", "active", "review"] as const

/**
 * Tasks assigned to the user in open sprints (one row more than the limit,
 * to detect truncation). `projectIds` null = any live, active project
 * (the caller still checks each project through resolveV1ProjectActor).
 */
export function findMyTasks(db: Db, userId: string, projectIds: string[] | null, includeDone: boolean) {
  const openSprint = { status: { in: [...OPEN_SPRINT_STATUSES] } }
  return db.sprintBacklogItem.findMany({
    where: {
      assignees: { some: { userId } },
      taskName: { not: null },
      ...LIVE_PBI,
      ...(includeDone ? {} : { status: { not: "done" } }),
      sprint: projectIds
        ? { ...openSprint, projectId: { in: projectIds } }
        : { ...openSprint, project: { deletedAt: null, status: "active" } },
    },
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
      pbItem: { select: { id: true, displayId: true, initiative: true, userStory: true } },
      sprint: { select: { id: true, sprintName: true, status: true, projectId: true } },
    },
    orderBy: OLDEST_FIRST,
    take: V1_MY_TASKS_LIMIT + 1,
  })
}

/** Upper bound of tasks compared for the duplicate hint of a task create. */
export const V1_SIMILAR_TASK_SCAN = 200

/** Tasks of one PBI in one sprint of the project (for the duplicate hint of create_task). */
export function findPbiTasksInSprint(db: Db, projectId: string, sprintId: string, pbItemId: string) {
  return db.sprintBacklogItem.findMany({
    where: { sprintId, pbItemId, sprint: { projectId }, taskName: { not: null }, ...LIVE_PBI },
    select: { id: true, taskName: true, status: true },
    orderBy: { createdAt: "asc" },
    take: V1_SIMILAR_TASK_SCAN,
  })
}
