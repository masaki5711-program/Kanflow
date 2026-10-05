import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import {
  IMPROVEMENT_MAX_CHECKS,
  IMPROVEMENT_MAX_PHOTOS_PER_PHASE,
  IMPROVEMENT_MAX_ROLLOUTS,
  PHOTO_PHASES,
} from "@/lib/improvement/constants"

export const ROLLOUT_SELECT = { id: true, targetName: true, status: true, doneAt: true, sortOrder: true } as const

export const CHECK_SELECT = {
  id: true,
  dueDate: true,
  kind: true,
  checkedAt: true,
  result: true,
  note: true,
  checkedByName: true,
  notifiedAt: true,
} as const

/** Photo DTO columns (no releaseItemId: the URL carries it; fileName stays server-side). */
export const PHOTO_SELECT = { id: true, phase: true, originalName: true, fileSize: true, mimeType: true, createdAt: true } as const

const BOARD_INCLUDE = {
  pbItem: { select: { id: true, displayId: true, userStory: true, epic: true, initiative: true, workloadScore: true, deletedAt: true } },
  rollouts: { select: ROLLOUT_SELECT, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: IMPROVEMENT_MAX_ROLLOUTS },
  checks: { select: CHECK_SELECT, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: IMPROVEMENT_MAX_CHECKS },
  photos: { select: PHOTO_SELECT, orderBy: { createdAt: "asc" }, take: IMPROVEMENT_MAX_PHOTOS_PER_PHASE * PHOTO_PHASES.length },
} satisfies Prisma.ReleaseBacklogItemInclude

/** Every release item of the project with its rollouts, checks and photos (board order: oldest first). */
export function findBoardItems(db: Db, projectId: string) {
  return db.releaseBacklogItem.findMany({
    where: { projectId },
    include: BOARD_INCLUDE,
    orderBy: [{ createdAt: "asc" }],
    take: LIST_LIMITS.releaseItems,
  })
}

export function findBoardItem(db: Db, projectId: string, id: string) {
  return db.releaseBacklogItem.findFirst({ where: { id, projectId }, include: BOARD_INCLUDE })
}

/** The item's columns the stage guard / check scheduling need, or null when not in the project. */
export function findItemState(db: Db, projectId: string, id: string) {
  return db.releaseBacklogItem.findFirst({
    where: { id, projectId },
    select: {
      id: true,
      userStory: true,
      initiative: true,
      manualLink: true,
      releaseDate: true,
      kaizenStage: true,
      standardizedAt: true,
      direction: true,
      baselineValue: true,
      targetValue: true,
    },
  })
}

export function updateItem(db: Db, projectId: string, id: string, data: Prisma.ReleaseBacklogItemUncheckedUpdateInput) {
  return db.releaseBacklogItem.update({ where: { id, projectId }, data })
}

export function countSustainedChecks(db: Db, releaseItemId: string) {
  return db.improvementCheck.count({ where: { releaseItemId, result: "sustained" } })
}

/** Project type + live flag (the board exists only for live process_improvement projects). */
export function findProjectType(db: Db, projectId: string) {
  return db.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { projectType: true, name: true } })
}

/** 横展開先 names used before in the project (suggestions for the datalist), most used first. */
export async function findRolloutNames(db: Db, projectId: string, limit = 50): Promise<string[]> {
  const rows = await db.improvementRollout.groupBy({
    by: ["targetName"],
    where: { releaseItem: { projectId } },
    _count: { targetName: true },
    orderBy: { _count: { targetName: "desc" } },
    take: limit,
  })
  return rows.map((r) => r.targetName)
}

/** File names of every photo of the item (for removing the stored files after the item is deleted). */
export function findPhotoFileNames(db: Db, releaseItemId: string) {
  return db.improvementPhoto.findMany({ where: { releaseItemId }, select: { fileName: true } })
}
