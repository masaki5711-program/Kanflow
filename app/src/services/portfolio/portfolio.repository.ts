/**
 * Portfolio reads. Every query is batched over the page's project ids (one
 * query per kind, never one per project) and selects only columns that
 * exist in every deployed schema version.
 */
import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIVE_PBI, NOT_DELETED } from "@/services/_shared/soft-delete"
import { VELOCITY_STATUSES } from "@/services/sprints/velocity"

/** Upper bound of projects on one portfolio page. */
export const PORTFOLIO_PROJECT_CAP = 300
/** Finished sprints considered for the velocity trend (per project we keep the newest 3). */
const VELOCITY_LOOKBACK_DAYS = 365
const VELOCITY_ROW_CAP = 20_000
/** Plan rows loaded across all listed projects. */
const PLAN_ROW_CAP = 50_000
const DAY_MS = 86_400_000

export function findPortfolioProjects(db: Db, where: Prisma.ProjectWhereInput) {
  return db.project.findMany({
    where,
    orderBy: { name: "asc" },
    take: PORTFOLIO_PROJECT_CAP + 1,
    select: {
      id: true,
      name: true,
      status: true,
      sections: { select: { section: { select: { id: true, name: true, sortOrder: true } } } },
    },
  })
}

/** Planning / active sprints with their live-PBI task rows (placeholders included; the service filters). */
export function findOpenSprints(db: Db, projectIds: readonly string[]) {
  return db.sprint.findMany({
    where: { projectId: { in: [...projectIds] }, status: { in: ["planning", "active"] } },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      projectId: true,
      sprintName: true,
      status: true,
      startDate: true,
      endDate: true,
      actualScore: true,
      items: {
        where: LIVE_PBI,
        select: { taskName: true, status: true, completedAt: true, pbItemId: true, pbItem: { select: { workloadScore: true } } },
      },
    },
  })
}

export function findFinishedSprints(db: Db, projectIds: readonly string[], now: Date) {
  return db.sprint.findMany({
    where: {
      projectId: { in: [...projectIds] },
      status: { in: [...VELOCITY_STATUSES] },
      endDate: { gte: new Date(now.getTime() - VELOCITY_LOOKBACK_DAYS * DAY_MS) },
    },
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
    take: VELOCITY_ROW_CAP,
    select: { projectId: true, actualScore: true, endDate: true },
  })
}

/** Open (not completed) live PBIs: count and points per project. */
export function countOpenPbis(db: Db, projectIds: readonly string[]) {
  return db.productBacklogItem.groupBy({
    by: ["projectId"],
    where: { projectId: { in: [...projectIds] }, ...NOT_DELETED, status: { not: "completed" } },
    _count: { _all: true },
    _sum: { workloadScore: true },
  })
}

/** Newest surveillance report per project: max(createdAt) per project, then those rows. */
export async function findLatestSurveillance(db: Db, projectIds: readonly string[]) {
  const latest = await db.aiReport.groupBy({
    by: ["projectId"],
    where: { projectId: { in: [...projectIds] }, trigger: "surveillance" },
    _max: { createdAt: true },
  })
  const keys = latest.flatMap((l) => (l._max.createdAt ? [{ projectId: l.projectId, createdAt: l._max.createdAt }] : []))
  if (keys.length === 0) return []
  return db.aiReport.findMany({
    where: { trigger: "surveillance", OR: keys },
    select: { projectId: true, createdAt: true, meta: true },
  })
}

/** Live plan rows (existing columns only). */
export function findPlanRows(db: Db, projectIds: readonly string[]) {
  return db.planItem.findMany({
    where: { projectId: { in: [...projectIds] }, ...NOT_DELETED },
    take: PLAN_ROW_CAP,
    select: { id: true, projectId: true, parentId: true, progressPct: true, plannedStart: true, plannedEnd: true, status: true, isMilestone: true },
  })
}

export function findLastActivity(db: Db, projectIds: readonly string[]) {
  return db.activityLog.groupBy({
    by: ["projectId"],
    where: { projectId: { in: [...projectIds] } },
    _max: { createdAt: true },
  })
}
