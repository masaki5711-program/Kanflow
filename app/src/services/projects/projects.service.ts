import { removeProjectUploadDir } from "@/lib/api-helpers"
import type { AccessVia } from "@/lib/authz/policy"
import { logger } from "@/lib/logger"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import { attachI18n, enqueueIn, getI18nFor, prepareText, purgeIn } from "@/services/_shared/translations"
import { attachTemplate, type ProjectTemplate } from "@/services/attachments/attachments.service"
import * as repo from "./projects.repository"
import type { CreateProjectInput, UpdateProjectInput } from "./projects.schemas"

const log = logger.child({ module: "projects-service" })

/** Seeded into every new project's attachments. */
export const PRODUCT_GOAL_TEMPLATE: ProjectTemplate = {
  fileName: "ProductGoalSheet.xlsx",
  displayName: "ProductGoalSheet.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

interface CreatorProfile {
  role: string
  sections: ReadonlyArray<{ sectionId: string }>
}

/**
 * Section assignment policy for a new project:
 * - admin: the explicitly requested sectionIds (or none)
 * - others: inherit ALL of the creator's sections (request ignored)
 */
export function resolveNewProjectSections(creator: CreatorProfile | null, requested: readonly string[] | undefined): string[] {
  if (creator?.role === "admin") return [...(requested ?? [])]
  return creator?.sections.map((s) => s.sectionId) ?? []
}

/**
 * Every section id must exist (400 SECTION_NOT_FOUND instead of a FK 500).
 * Returns the ids de-duplicated, in request order.
 */
export async function assertSectionsExist(db: Db, sectionIds: readonly string[]): Promise<string[]> {
  const unique = [...new Set(sectionIds)]
  if (unique.length === 0) return unique
  const found = new Set((await repo.findExistingSectionIds(db, unique)).map((s) => s.id))
  if (unique.some((id) => !found.has(id))) throw new ValidationError("Section not found", {}, "SECTION_NOT_FOUND")
  return unique
}

export async function createProject(input: CreateProjectInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const creator = await repo.findCreatorProfile(defaultDb, actor.userId)
  const project = await withTransaction(async (tx) => {
    const sectionIds = await assertSectionsExist(tx, resolveNewProjectSections(creator, data.sectionIds))
    const created = await repo.insertProject(tx, {
      name: data.name,
      description: data.description,
      projectType: data.projectType ?? "software",
      language: creator?.language ?? "ja",
      ownerId: actor.userId,
      sectionIds,
    })
    await enqueueIn(tx, "project", created.id, created)
    return created
  })
  await attachTemplate(project.id, PRODUCT_GOAL_TEMPLATE, actor.userName)
  return project
}

export async function getProject(projectId: string, via: AccessVia) {
  const project = await repo.findProjectDetail(defaultDb, projectId)
  if (!project) throw new NotFoundError()
  const [i18nMap, productGoals] = await Promise.all([
    getI18nFor("project", [project.id]),
    attachI18n("product_goal", project.productGoals),
  ])
  return {
    ...project,
    productGoals,
    sections: project.sections.map((s) => s.section),
    i18n: i18nMap.get(project.id) ?? {},
    _accessVia: via,
  }
}

/** Field-level permission is checked by the route (projects.policy.ts). */
export async function updateProject(projectId: string, input: UpdateProjectInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const { sectionIds, ...rest } = data
  return withTransaction(async (tx) => {
    const updated = await repo.updateProject(tx, projectId, rest)
    if (sectionIds !== undefined) {
      await repo.replaceProjectSections(tx, projectId, await assertSectionsExist(tx, sectionIds))
    }
    await enqueueIn(tx, "project", projectId, rest)
    return updated
  })
}

/**
 * Deletes the project (children cascade in the DB) and, in the same
 * transaction, the translation rows of the project AND every cascaded child
 * (goals, icebox, PBIs, sprints, tasks, daily scrums, releases, events, plan).
 */
export async function deleteProject(projectId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const tree = await repo.collectProjectTranslationTree(tx, projectId)
    await purgeIn(tx, tree)
    await repo.deleteProject(tx, projectId)
  })
  await cleanupProjectUploads(projectId)
}

/**
 * Best-effort removal of `private/uploads/<projectId>` AFTER the DB delete
 * committed. Never throws: a leftover directory is only logged, the delete
 * request still succeeds.
 */
export async function cleanupProjectUploads(projectId: string): Promise<void> {
  try {
    const removed = await removeProjectUploadDir(projectId)
    if (!removed) log.warn("project upload dir skipped: unsafe path", { projectId })
  } catch (err) {
    log.error("project upload dir removal failed", {
      projectId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function favoriteProject(userId: string, projectId: string): Promise<void> {
  await repo.upsertFavorite(defaultDb, userId, projectId)
}

/** Idempotent (no error when not favorited). */
export async function unfavoriteProject(userId: string, projectId: string): Promise<void> {
  await repo.deleteFavorites(defaultDb, userId, projectId)
}
