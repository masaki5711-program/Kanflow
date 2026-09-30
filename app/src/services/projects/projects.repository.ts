import type { Db } from "@/services/_shared/db"
import { NOT_DELETED, RESTORE_DATA, notDeleted, softDeleteData } from "@/services/_shared/soft-delete"
import type { TranslationTree } from "@/services/_shared/translations"

export function findCreatorProfile(db: Db, userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      language: true,
      role: true,
      sections: { select: { sectionId: true }, orderBy: { assignedAt: "asc" } },
    },
  })
}

export interface NewProject {
  name: string
  description: string | undefined
  projectType: string
  language: string
  ownerId: string
  sectionIds: readonly string[]
}

/** The creator becomes the first PO. */
export function insertProject(db: Db, p: NewProject) {
  return db.project.create({
    data: {
      name: p.name,
      description: p.description,
      projectType: p.projectType,
      language: p.language,
      members: { create: { userId: p.ownerId, role: "po" } },
      sections: p.sectionIds.length
        ? { create: p.sectionIds.map((sectionId) => ({ sectionId })) }
        : undefined,
    },
  })
}

/** `_count` of trash-able children: live rows only. */
const LIVE_COUNT = { where: NOT_DELETED } as const

export function findProjectDetail(db: Db, projectId: string) {
  return db.project.findUnique({
    where: notDeleted({ id: projectId }),
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      productGoals: true,
      sections: { include: { section: { select: { id: true, name: true } } } },
      _count: {
        select: { iceboxItems: LIVE_COUNT, backlogItems: LIVE_COUNT, sprints: true, releaseItems: true },
      },
    },
  })
}

export function updateProject(db: Db, projectId: string, data: Record<string, unknown>) {
  return db.project.update({ where: { id: projectId }, data })
}

export async function replaceProjectSections(db: Db, projectId: string, sectionIds: readonly string[]): Promise<void> {
  await db.projectSection.deleteMany({ where: { projectId } })
  if (sectionIds.length > 0) {
    await db.projectSection.createMany({
      data: sectionIds.map((sectionId) => ({ projectId, sectionId })),
    })
  }
}

/** Hard delete (purge; children cascade). Normal deletes go to the trash via softDeleteProject. */
export function deleteProject(db: Db, projectId: string) {
  return db.project.delete({ where: { id: projectId } })
}

const ids = (rows: ReadonlyArray<{ id: string }>): string[] => rows.map((r) => r.id)

/**
 * Every translatable entity that is deleted (by FK cascade) together with the
 * project. One id-only query per entity type.
 */
export async function collectProjectTranslationTree(db: Db, projectId: string): Promise<TranslationTree> {
  const byProject = { where: { projectId }, select: { id: true } } as const
  const bySprintProject = { where: { sprint: { projectId } }, select: { id: true } } as const
  return {
    project: [projectId],
    product_goal: ids(await db.productGoal.findMany(byProject)),
    icebox_item: ids(await db.iceboxItem.findMany(byProject)),
    backlog_item: ids(await db.productBacklogItem.findMany(byProject)),
    sprint: ids(await db.sprint.findMany(byProject)),
    sprint_task: ids(await db.sprintBacklogItem.findMany(bySprintProject)),
    daily_scrum_note: ids(await db.dailyScrumNote.findMany(bySprintProject)),
    release_item: ids(await db.releaseBacklogItem.findMany(byProject)),
    calendar_event: ids(await db.calendarEvent.findMany(byProject)),
    plan_item: ids(await db.planItem.findMany(byProject)),
  }
}

export function upsertFavorite(db: Db, userId: string, projectId: string) {
  return db.userProjectFavorite.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId },
    update: {},
  })
}

export function deleteFavorites(db: Db, userId: string, projectId: string) {
  return db.userProjectFavorite.deleteMany({ where: { userId, projectId } })
}

/** Which of the given section ids exist (sections are global master data). */
export function findExistingSectionIds(db: Db, sectionIds: readonly string[]) {
  return db.section.findMany({ where: { id: { in: [...sectionIds] } }, select: { id: true } })
}

// === trash ===

const TRASHED = { deletedAt: { not: null } } as const

/** Move a live project to the trash. False when no live project matched. */
export async function softDeleteProject(db: Db, projectId: string, actorUserId: string, now: Date = new Date()): Promise<boolean> {
  const res = await db.project.updateMany({ where: notDeleted({ id: projectId }), data: softDeleteData(actorUserId, now) })
  return res.count > 0
}

/** Take a trashed project out of the trash. False when no trashed project matched. */
export async function restoreProjectRow(db: Db, projectId: string): Promise<boolean> {
  const res = await db.project.updateMany({ where: { id: projectId, ...TRASHED }, data: RESTORE_DATA })
  return res.count > 0
}

/**
 * Permanently delete the project only while it is still in the trash (one
 * conditional DELETE: a concurrent restore that committed first makes this a
 * no-op). Returns whether the row was deleted.
 */
export async function deleteTrashedProject(db: Db, projectId: string): Promise<boolean> {
  const res = await db.project.deleteMany({ where: { id: projectId, ...TRASHED } })
  return res.count > 0
}

export function findTrashedProject(db: Db, projectId: string) {
  return db.project.findFirst({ where: { id: projectId, ...TRASHED }, select: { id: true, name: true } })
}

/** Every trashed project (admin trash), newest deletion first, with live child counts. */
export function findTrashedProjects(db: Db) {
  return db.project.findMany({
    where: TRASHED,
    select: {
      id: true,
      name: true,
      status: true,
      deletedAt: true,
      deletedById: true,
      _count: { select: { backlogItems: LIVE_COUNT, iceboxItems: LIVE_COUNT, sprints: true } },
    },
    orderBy: { deletedAt: "desc" },
    take: TRASHED_PROJECTS_LIMIT,
  })
}

/** Upper bound of the admin trash list (projects are few; this only guards the query). */
export const TRASHED_PROJECTS_LIMIT = 500

/** Trashed projects whose retention ended; oldest first, bounded batch. */
export function findExpiredTrashedProjects(db: Db, cutoff: Date, take: number) {
  return db.project.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { deletedAt: "asc" },
    take,
  })
}
