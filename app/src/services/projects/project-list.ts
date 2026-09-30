/**
 * The home page project list: which projects a user sees (role scope), what
 * each card needs, and the lazily loaded archived section
 * (GET /api/projects/archived).
 *
 * Scope:
 * - admin: every project
 * - section_manager: own member projects + projects in their sections
 * - others: own member projects
 * Trashed projects (deletedAt set) never appear.
 */
import { defaultDb, type Db } from "@/services/_shared/db"
import { getI18nFor } from "@/services/_shared/translations"
import type { EntityI18n } from "@/lib/translation/types"

export type ProjectListStatus = "active" | "archived"

export interface ProjectListUser {
  id: string
  role?: string | null
}

export interface ProjectListScope {
  userId: string
  isAdmin: boolean
  /** Sections of a section manager (empty for everyone else). */
  sectionIds: readonly string[]
}

/** Resolve the role scope (one query for section managers). */
export async function loadProjectListScope(user: ProjectListUser, db: Db = defaultDb): Promise<ProjectListScope> {
  const isAdmin = user.role === "admin"
  const sectionIds =
    user.role === "section_manager"
      ? (await db.userSection.findMany({ where: { userId: user.id }, select: { sectionId: true } })).map((s) => s.sectionId)
      : []
  return { userId: user.id, isAdmin, sectionIds }
}

/** Pure: Prisma `where` of the projects in scope with the given status. */
export function projectListWhere(scope: ProjectListScope, status: ProjectListStatus) {
  if (scope.isAdmin) return { status, deletedAt: null }
  if (scope.sectionIds.length > 0) {
    return {
      status,
      deletedAt: null,
      OR: [
        { members: { some: { userId: scope.userId } } },
        { sections: { some: { sectionId: { in: [...scope.sectionIds] } } } },
      ],
    }
  }
  return { members: { some: { userId: scope.userId } }, status, deletedAt: null }
}

/** Pure: everything a project card renders. */
export function projectListInclude(userId: string) {
  return {
    members: { include: { user: { select: { id: true, name: true } } } },
    sections: { include: { section: { select: { id: true, name: true } } } },
    favoritedBy: { where: { userId }, select: { userId: true } },
    // Latest autonomous AI report → list badge (severity from title emoji)
    aiReports: { orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, title: true } },
    _count: {
      select: {
        iceboxItems: { where: { deletedAt: null } },
        backlogItems: { where: { deletedAt: null } },
        sprints: true,
        aiReports: true,
      },
    },
  }
}

export function findProjectList(scope: ProjectListScope, status: ProjectListStatus, db: Db = defaultDb) {
  return db.project.findMany({
    where: projectListWhere(scope, status),
    include: projectListInclude(scope.userId),
    orderBy: { updatedAt: "desc" },
  })
}

export function countProjectList(scope: ProjectListScope, status: ProjectListStatus, db: Db = defaultDb): Promise<number> {
  return db.project.count({ where: projectListWhere(scope, status) })
}

type ProjectListRow = Awaited<ReturnType<typeof findProjectList>>[number]

/** Pure: flatten junction rows and surface the per-user favorite flag. */
export function toProjectListItem(row: ProjectListRow, i18n: EntityI18n | undefined) {
  return {
    ...row,
    sections: row.sections.map((ps) => ps.section),
    isFavorite: row.favoritedBy.length > 0,
    i18n: i18n ?? {},
  }
}

export type ProjectListItem = ReturnType<typeof toProjectListItem>

/** Archived projects of the user's scope, ready for the list (with both-language names). */
export async function listArchivedProjects(user: ProjectListUser): Promise<ProjectListItem[]> {
  const scope = await loadProjectListScope(user)
  const rows = await findProjectList(scope, "archived")
  const i18n = await getI18nFor("project", rows.map((p) => p.id))
  return rows.map((row) => toProjectListItem(row, i18n.get(row.id)))
}
