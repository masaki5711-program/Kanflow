import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { BUDGET_SELECT, CHECK_SELECT, DOCUMENT_SELECT, FILE_SELECT, METRIC_SELECT, PUNCH_SELECT } from "./milestones.repository"

/**
 * Writes of the board parts. Every lookup is scoped to the project (child
 * rows through their parent), so a foreign id reads as "not found".
 */

/** Next sortOrder after the existing rows (0 for the first). */
function nextOrder(max: { _max: { sortOrder: number | null } }): number {
  return (max._max.sortOrder ?? -1) + 1
}

// === checks (チェック項目) ===

export async function insertCheck(db: Db, data: Omit<Prisma.AcceptanceCheckUncheckedCreateInput, "sortOrder">) {
  const sortOrder = nextOrder(await db.acceptanceCheck.aggregate({ where: { projectId: data.projectId }, _max: { sortOrder: true } }))
  return db.acceptanceCheck.create({ data: { ...data, sortOrder }, select: CHECK_SELECT })
}

export const countChecks = (db: Db, projectId: string) => db.acceptanceCheck.count({ where: { projectId } })
export const findCheck = (db: Db, projectId: string, id: string) => db.acceptanceCheck.findFirst({ where: { id, projectId }, select: CHECK_SELECT })
export const updateCheck = (db: Db, id: string, data: Prisma.AcceptanceCheckUncheckedUpdateInput) => db.acceptanceCheck.update({ where: { id }, data, select: CHECK_SELECT })
export const deleteCheck = (db: Db, id: string) => db.acceptanceCheck.delete({ where: { id } })
export const findCheckNames = (db: Db, projectId: string) => db.acceptanceCheck.findMany({ where: { projectId }, select: { name: true } })

// === punch list (残課題) ===

export const countPunch = (db: Db, projectId: string) => db.punchItem.count({ where: { projectId } })
export const insertPunch = (db: Db, data: Prisma.PunchItemUncheckedCreateInput) => db.punchItem.create({ data, select: PUNCH_SELECT })
export const findPunch = (db: Db, projectId: string, id: string) => db.punchItem.findFirst({ where: { id, projectId }, select: PUNCH_SELECT })
export const updatePunch = (db: Db, id: string, data: Prisma.PunchItemUncheckedUpdateInput) => db.punchItem.update({ where: { id }, data, select: PUNCH_SELECT })
export const deletePunch = (db: Db, id: string) => db.punchItem.delete({ where: { id } })
export const findPunchFileNames = (db: Db, punchItemId: string) => db.punchPhoto.findMany({ where: { punchItemId }, select: { fileName: true } })
export const countPunchPhotos = (db: Db, punchItemId: string) => db.punchPhoto.count({ where: { punchItemId } })

export function insertPunchPhoto(db: Db, data: { punchItemId: string; fileName: string; originalName: string; fileSize: number; mimeType: string }) {
  return db.punchPhoto.create({ data, select: FILE_SELECT })
}

export function findPunchPhoto(db: Db, projectId: string, punchItemId: string, id: string) {
  return db.punchPhoto.findFirst({ where: { id, punchItemId, punchItem: { projectId } } })
}

export const deletePunchPhoto = (db: Db, id: string) => db.punchPhoto.delete({ where: { id } })

// === hand-over documents (引き渡し資料) ===

export async function insertDocument(db: Db, projectId: string, name: string) {
  const sortOrder = nextOrder(await db.handoverDocument.aggregate({ where: { projectId }, _max: { sortOrder: true } }))
  return db.handoverDocument.create({ data: { projectId, name, sortOrder }, select: DOCUMENT_SELECT })
}

export const countDocuments = (db: Db, projectId: string) => db.handoverDocument.count({ where: { projectId } })
export const findDocument = (db: Db, projectId: string, id: string) => db.handoverDocument.findFirst({ where: { id, projectId }, select: DOCUMENT_SELECT })
export const updateDocument = (db: Db, id: string, data: Prisma.HandoverDocumentUncheckedUpdateInput) => db.handoverDocument.update({ where: { id }, data, select: DOCUMENT_SELECT })
export const deleteDocument = (db: Db, id: string) => db.handoverDocument.delete({ where: { id } })
export const findDocumentNames = (db: Db, projectId: string) => db.handoverDocument.findMany({ where: { projectId }, select: { name: true } })
export const findDocumentFileNames = (db: Db, documentId: string) => db.handoverFile.findMany({ where: { documentId }, select: { fileName: true } })
export const countDocumentFiles = (db: Db, documentId: string) => db.handoverFile.count({ where: { documentId } })

export function insertDocumentFile(
  db: Db,
  data: { documentId: string; fileName: string; originalName: string; fileSize: number; mimeType: string; uploadedByName: string | null },
) {
  return db.handoverFile.create({ data, select: FILE_SELECT })
}

export function findDocumentFile(db: Db, projectId: string, documentId: string, id: string) {
  return db.handoverFile.findFirst({ where: { id, documentId, document: { projectId } } })
}

export const deleteDocumentFile = (db: Db, id: string) => db.handoverFile.delete({ where: { id } })

// === budget (予算) ===

export async function insertBudgetLine(db: Db, data: Omit<Prisma.BudgetLineUncheckedCreateInput, "sortOrder">) {
  const sortOrder = nextOrder(await db.budgetLine.aggregate({ where: { projectId: data.projectId }, _max: { sortOrder: true } }))
  return db.budgetLine.create({ data: { ...data, sortOrder }, select: BUDGET_SELECT })
}

export const countBudgetLines = (db: Db, projectId: string) => db.budgetLine.count({ where: { projectId } })
export const findBudgetLine = (db: Db, projectId: string, id: string) => db.budgetLine.findFirst({ where: { id, projectId }, select: BUDGET_SELECT })
export const updateBudgetLine = (db: Db, id: string, data: Prisma.BudgetLineUncheckedUpdateInput) => db.budgetLine.update({ where: { id }, data, select: BUDGET_SELECT })
export const deleteBudgetLine = (db: Db, id: string) => db.budgetLine.delete({ where: { id } })

// === trend metrics (推移) ===

export async function insertMetric(db: Db, data: Omit<Prisma.MilestoneMetricUncheckedCreateInput, "sortOrder">) {
  const sortOrder = nextOrder(await db.milestoneMetric.aggregate({ where: { projectId: data.projectId }, _max: { sortOrder: true } }))
  return db.milestoneMetric.create({ data: { ...data, sortOrder }, select: METRIC_SELECT })
}

export const countMetrics = (db: Db, projectId: string) => db.milestoneMetric.count({ where: { projectId } })
export const findMetric = (db: Db, projectId: string, id: string) => db.milestoneMetric.findFirst({ where: { id, projectId }, select: METRIC_SELECT })
export const updateMetric = (db: Db, id: string, data: Prisma.MilestoneMetricUncheckedUpdateInput) => db.milestoneMetric.update({ where: { id }, data, select: METRIC_SELECT })
export const deleteMetric = (db: Db, id: string) => db.milestoneMetric.delete({ where: { id } })
export const countMetricPoints = (db: Db, metricId: string) => db.milestoneMetricPoint.count({ where: { metricId } })
export const hasMetricPoint = async (db: Db, metricId: string, month: string) => (await db.milestoneMetricPoint.count({ where: { metricId, month } })) > 0

export function upsertMetricPoint(db: Db, metricId: string, month: string, value: number, recordedByName: string | null) {
  return db.milestoneMetricPoint.upsert({
    where: { metricId_month: { metricId, month } },
    create: { metricId, month, value, recordedByName },
    update: { value, recordedByName },
  })
}

export const deleteMetricPoint = (db: Db, metricId: string, month: string) => db.milestoneMetricPoint.deleteMany({ where: { metricId, month } })

// === stage conditions (完了条件) ===

export function tickCondition(db: Db, planItemId: string, label: string, actor: { userId: string; userName: string | null }) {
  return db.milestoneChecklistState.upsert({
    where: { planItemId_label: { planItemId, label } },
    create: { planItemId, label, checkedById: actor.userId, checkedByName: actor.userName },
    update: {},
  })
}

export const untickCondition = (db: Db, planItemId: string, label: string) => db.milestoneChecklistState.deleteMany({ where: { planItemId, label } })

// === seeding ===

export const insertSeedMarker = (db: Db, applicationId: string, projectId: string) => db.milestoneBoardSeed.create({ data: { applicationId, projectId } })
