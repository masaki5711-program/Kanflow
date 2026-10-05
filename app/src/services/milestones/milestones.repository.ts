import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { NOT_DELETED } from "@/services/_shared/soft-delete"
import {
  MS_MAX_BUDGET_LINES,
  MS_MAX_CHECKS,
  MS_MAX_DOCUMENT_FILES,
  MS_MAX_DOCUMENTS,
  MS_MAX_METRIC_POINTS,
  MS_MAX_METRICS,
  MS_MAX_PUNCH_ITEMS,
  MS_MAX_PUNCH_PHOTOS,
} from "@/lib/milestones/constants"

/**
 * Board reads of the マイルストーン・検収ボード. Stages come straight from
 * the live PlanItems (never copied); every other part is project-scoped.
 */

/** File DTO columns (fileName stays server-side). */
export const FILE_SELECT = { id: true, originalName: true, fileSize: true, mimeType: true, createdAt: true } as const

export const CHECK_SELECT = {
  id: true,
  planItemId: true,
  name: true,
  criterion: true,
  result: true,
  witness: true,
  checkedAt: true,
  note: true,
  recordedByName: true,
  sortOrder: true,
} as const

export const PUNCH_SELECT = {
  id: true,
  planItemId: true,
  title: true,
  detail: true,
  assigneeId: true,
  assigneeName: true,
  dueDate: true,
  status: true,
  closedAt: true,
  createdByName: true,
  createdAt: true,
  photos: { select: FILE_SELECT, orderBy: { createdAt: "asc" }, take: MS_MAX_PUNCH_PHOTOS },
} satisfies Prisma.PunchItemSelect

export const DOCUMENT_SELECT = {
  id: true,
  name: true,
  status: true,
  receivedAt: true,
  receivedByName: true,
  note: true,
  sortOrder: true,
  files: { select: { ...FILE_SELECT, uploadedByName: true }, orderBy: { createdAt: "asc" }, take: MS_MAX_DOCUMENT_FILES },
} satisfies Prisma.HandoverDocumentSelect

export const BUDGET_SELECT = { id: true, name: true, plannedYen: true, actualYen: true, note: true, sortOrder: true } as const

export const METRIC_SELECT = {
  id: true,
  name: true,
  unit: true,
  direction: true,
  baselineValue: true,
  targetValue: true,
  sortOrder: true,
  points: { select: { month: true, value: true, recordedByName: true }, orderBy: { month: "asc" }, take: MS_MAX_METRIC_POINTS },
} satisfies Prisma.MilestoneMetricSelect

const BY_ORDER = [{ sortOrder: "asc" }, { createdAt: "asc" }] as const

/** Every live plan item (tree + the columns a stage card shows) with its ticked conditions. */
export function findPlanRows(db: Db, projectId: string) {
  return db.planItem.findMany({
    where: { projectId, ...NOT_DELETED },
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
      notes: true,
      version: true,
      checklistStates: { select: { label: true, checkedByName: true, checkedAt: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMITS.planItems,
  })
}

export function findBoardParts(db: Db, projectId: string) {
  return Promise.all([
    db.acceptanceCheck.findMany({ where: { projectId }, select: CHECK_SELECT, orderBy: [...BY_ORDER], take: MS_MAX_CHECKS }),
    db.punchItem.findMany({ where: { projectId }, select: PUNCH_SELECT, orderBy: [{ createdAt: "desc" }], take: MS_MAX_PUNCH_ITEMS }),
    db.handoverDocument.findMany({ where: { projectId }, select: DOCUMENT_SELECT, orderBy: [...BY_ORDER], take: MS_MAX_DOCUMENTS }),
    db.budgetLine.findMany({ where: { projectId }, select: BUDGET_SELECT, orderBy: [...BY_ORDER], take: MS_MAX_BUDGET_LINES }),
    db.milestoneMetric.findMany({ where: { projectId }, select: METRIC_SELECT, orderBy: [...BY_ORDER], take: MS_MAX_METRICS }),
  ] as const)
}

export function findSettings(db: Db, projectId: string) {
  return db.milestoneBoard.findUnique({ where: { projectId } })
}

export function upsertSettings(db: Db, projectId: string, data: { checkLabel?: string | null; budgetEnabled?: boolean; trendEnabled?: boolean }) {
  return db.milestoneBoard.upsert({ where: { projectId }, create: { projectId, ...data }, update: data })
}

/** Template loads of the project, oldest first (names for the header, seeding). */
export function findApplications(db: Db, projectId: string) {
  return db.planTemplateApplication.findMany({
    where: { projectId },
    orderBy: { appliedAt: "asc" },
    take: 200,
    select: { id: true, templateName: true, content: true, template: { select: { builtinKey: true } }, milestoneSeed: { select: { applicationId: true } } },
  })
}

/** Project members (assignee picker), by name. */
export function findMembers(db: Db, projectId: string) {
  return db.projectMember.findMany({
    where: { projectId },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
    take: 500,
  })
}

/** A live plan item of the project (stage link / checklist target), or null. */
export function findLivePlanItem(db: Db, projectId: string, id: string) {
  return db.planItem.findFirst({ where: { id, projectId, ...NOT_DELETED }, select: { id: true, name: true, notes: true } })
}

export function findMemberName(db: Db, projectId: string, userId: string) {
  return db.projectMember.findFirst({ where: { projectId, userId }, select: { user: { select: { name: true } } } })
}
