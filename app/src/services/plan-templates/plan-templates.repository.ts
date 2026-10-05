import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { NOT_DELETED } from "@/services/_shared/soft-delete"
import { BUMP_VERSION, versionWhere } from "@/services/_shared/versioning"

/** Templates one list returns (built-ins + shared + own). */
export const TEMPLATE_LIST_LIMIT = 500
/** Edit-history snapshots kept per template (older ones are pruned on write). */
export const REVISIONS_KEPT = 100
/** Revisions one history list returns. */
export const REVISIONS_LIST_LIMIT = 100

// === templates ===

export function findBuiltinKeys(db: Db) {
  return db.planTemplate.findMany({ where: { builtinKey: { not: null } }, select: { builtinKey: true } })
}

/** Live templates the user can see: public, own, or every one for admins. */
export function findVisibleTemplates(db: Db, userId: string, isAdmin: boolean) {
  const where: Prisma.PlanTemplateWhereInput = isAdmin ? { ...NOT_DELETED } : { ...NOT_DELETED, OR: [{ visibility: "public" }, { ownerId: userId }] }
  return db.planTemplate.findMany({ where, orderBy: [{ updatedAt: "desc" }], take: TEMPLATE_LIST_LIMIT })
}

/** A live template by id (visibility is checked by the caller), or null. */
export function findTemplate(db: Db, id: string) {
  return db.planTemplate.findFirst({ where: { id, ...NOT_DELETED } })
}

export function insertTemplate(db: Db, data: Prisma.PlanTemplateUncheckedCreateInput) {
  return db.planTemplate.create({ data })
}

/** Optimistic-lock update (bumps version). Returns the row, or null when nothing matched. */
export async function updateTemplateVersioned(db: Db, id: string, data: Prisma.PlanTemplateUncheckedUpdateManyInput, version?: number) {
  const res = await db.planTemplate.updateMany({ where: { id, ...NOT_DELETED, ...versionWhere(version) }, data: { ...data, ...BUMP_VERSION } })
  return res.count === 0 ? null : db.planTemplate.findFirst({ where: { id } })
}

export async function softDeleteTemplate(db: Db, id: string, now: Date): Promise<boolean> {
  const res = await db.planTemplate.updateMany({ where: { id, builtinKey: null, ...NOT_DELETED }, data: { deletedAt: now, ...BUMP_VERSION } })
  return res.count > 0
}

// === revisions ===

export function insertRevision(db: Db, data: Prisma.PlanTemplateRevisionUncheckedCreateInput) {
  return db.planTemplateRevision.create({ data, select: { id: true } })
}

/** Drop snapshots beyond the newest REVISIONS_KEPT. */
export async function pruneRevisions(db: Db, templateId: string): Promise<void> {
  const stale = await db.planTemplateRevision.findMany({
    where: { templateId },
    orderBy: [{ editedAt: "desc" }, { version: "desc" }],
    skip: REVISIONS_KEPT,
    select: { id: true },
  })
  if (stale.length > 0) await db.planTemplateRevision.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } })
}

export function findRevisions(db: Db, templateId: string) {
  return db.planTemplateRevision.findMany({
    where: { templateId },
    orderBy: [{ editedAt: "desc" }, { version: "desc" }],
    take: REVISIONS_LIST_LIMIT,
    select: { id: true, templateId: true, version: true, name: true, description: true, visibility: true, action: true, editedById: true, editedByName: true, editedAt: true },
  })
}

export function findRevision(db: Db, templateId: string, revisionId: string) {
  return db.planTemplateRevision.findFirst({ where: { id: revisionId, templateId } })
}

// === applications (project side) ===

export function countApplications(db: Db, projectId: string, templateId: string) {
  return db.planTemplateApplication.count({ where: { projectId, templateId } })
}

export function insertApplication(db: Db, data: Prisma.PlanTemplateApplicationUncheckedCreateInput) {
  return db.planTemplateApplication.create({ data, select: { id: true } })
}

export function setApplicationRoots(db: Db, id: string, rootIds: readonly string[]) {
  return db.planTemplateApplication.update({ where: { id }, data: { createdRootIds: JSON.stringify(rootIds) }, select: { id: true } })
}

export function findApplications(db: Db, projectId: string) {
  return db.planTemplateApplication.findMany({
    where: { projectId },
    orderBy: { appliedAt: "desc" },
    take: 200,
    select: { id: true, templateId: true, templateName: true, templateVersion: true, createdRootIds: true, appliedById: true, appliedByName: true, appliedAt: true },
  })
}

/** One load with its content snapshot (the 検収 board reads checks / documents from it). */
export function findApplication(db: Db, projectId: string, id: string) {
  return db.planTemplateApplication.findFirst({ where: { id, projectId } })
}
