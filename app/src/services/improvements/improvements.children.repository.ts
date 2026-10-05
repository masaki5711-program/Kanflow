import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { CHECK_SELECT, PHOTO_SELECT, ROLLOUT_SELECT } from "./improvements.repository"

/**
 * Data access of the rows hanging off an improvement: 横展開先 (rollouts),
 * 定着確認 (checks) and before / after photos. Every lookup is scoped
 * through the release item to the project.
 */

const inProject = (releaseItemId: string, projectId: string) => ({ releaseItemId, releaseItem: { projectId } })

// === rollouts ===

export function findRollout(db: Db, projectId: string, releaseItemId: string, id: string) {
  return db.improvementRollout.findFirst({ where: { id, ...inProject(releaseItemId, projectId) }, select: ROLLOUT_SELECT })
}

export function findRollouts(db: Db, releaseItemId: string) {
  return db.improvementRollout.findMany({ where: { releaseItemId }, select: ROLLOUT_SELECT, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })
}

export function countRollouts(db: Db, releaseItemId: string) {
  return db.improvementRollout.count({ where: { releaseItemId } })
}

export function insertRollout(db: Db, data: { releaseItemId: string; targetName: string; sortOrder: number }) {
  return db.improvementRollout.create({ data, select: ROLLOUT_SELECT })
}

export function updateRollout(db: Db, id: string, data: Prisma.ImprovementRolloutUncheckedUpdateInput) {
  return db.improvementRollout.update({ where: { id }, data, select: ROLLOUT_SELECT })
}

export function deleteRollout(db: Db, id: string) {
  return db.improvementRollout.delete({ where: { id } })
}

// === checks ===

export function findCheck(db: Db, projectId: string, releaseItemId: string, id: string) {
  return db.improvementCheck.findFirst({ where: { id, ...inProject(releaseItemId, projectId) }, select: CHECK_SELECT })
}

export function findChecks(db: Db, releaseItemId: string) {
  return db.improvementCheck.findMany({ where: { releaseItemId }, select: { ...CHECK_SELECT, releaseItemId: true } })
}

export function countChecks(db: Db, releaseItemId: string) {
  return db.improvementCheck.count({ where: { releaseItemId } })
}

export function insertChecks(db: Db, rows: ReadonlyArray<{ releaseItemId: string; dueDate: Date; kind: string }>) {
  return db.improvementCheck.createMany({ data: [...rows] })
}

export function insertCheck(db: Db, data: { releaseItemId: string; dueDate: Date; kind: string }) {
  return db.improvementCheck.create({ data, select: CHECK_SELECT })
}

export function updateCheck(db: Db, id: string, data: Prisma.ImprovementCheckUncheckedUpdateInput) {
  return db.improvementCheck.update({ where: { id }, data, select: CHECK_SELECT })
}

export function deleteCheck(db: Db, id: string) {
  return db.improvementCheck.delete({ where: { id } })
}

// === photos ===

export function findPhotos(db: Db, releaseItemId: string) {
  return db.improvementPhoto.findMany({ where: { releaseItemId }, select: PHOTO_SELECT, orderBy: { createdAt: "asc" } })
}

export function countPhotos(db: Db, releaseItemId: string, phase: string) {
  return db.improvementPhoto.count({ where: { releaseItemId, phase } })
}

export function insertPhoto(
  db: Db,
  data: { releaseItemId: string; phase: string; fileName: string; originalName: string; fileSize: number; mimeType: string }
) {
  return db.improvementPhoto.create({ data, select: PHOTO_SELECT })
}

/** One photo with its stored file name (for serving / deleting). */
export function findPhoto(db: Db, projectId: string, releaseItemId: string, id: string) {
  return db.improvementPhoto.findFirst({ where: { id, ...inProject(releaseItemId, projectId) } })
}

export function deletePhoto(db: Db, id: string) {
  return db.improvementPhoto.delete({ where: { id } })
}
