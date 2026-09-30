import type { Db } from "@/services/_shared/db"
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

export function findProjectDetail(db: Db, projectId: string) {
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      productGoals: true,
      sections: { include: { section: { select: { id: true, name: true } } } },
      _count: {
        select: { iceboxItems: true, backlogItems: true, sprints: true, releaseItems: true },
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
