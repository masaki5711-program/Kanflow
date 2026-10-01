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
import { can } from "@/lib/authz/policy"
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

/** Per-card extras: dates for the card footer and the viewer's archive permission. */
export interface ProjectListMeta {
  /** max(newest ActivityLog row, Project.updatedAt). */
  lastActivityAt: Date
  /** When the project was last moved to the archive (archived list only; null when unknown). */
  archivedAt: Date | null
  /** Viewer may "project.update" this project (archive / restore from the list). */
  canUpdate: boolean
}

/** Newest ActivityLog.createdAt per project — ONE grouped query for the whole list. */
export async function loadLastActivity(projectIds: readonly string[], db: Db = defaultDb): Promise<Map<string, Date>> {
  if (projectIds.length === 0) return new Map()
  const groups = await db.activityLog.groupBy({
    by: ["projectId"],
    where: { projectId: { in: [...projectIds] } },
    _max: { createdAt: true },
  })
  return new Map(groups.flatMap((g) => (g._max.createdAt ? [[g.projectId, g._max.createdAt] as const] : [])))
}

/** Logged diff of a project update that moved it to the archive (services/_shared/activity.ts). */
export const ARCHIVED_DIFF = '"status":{"from":"active","to":"archived"}'

/** Latest "moved to the archive" log time per project (one query; archived list only). */
export async function loadArchivedAt(projectIds: readonly string[], db: Db = defaultDb): Promise<Map<string, Date>> {
  if (projectIds.length === 0) return new Map()
  const ids = [...projectIds]
  const rows = await db.activityLog.findMany({
    where: { projectId: { in: ids }, entityType: "project", entityId: { in: ids }, diff: { contains: ARCHIVED_DIFF } },
    orderBy: { createdAt: "desc" },
    select: { projectId: true, createdAt: true },
  })
  const out = new Map<string, Date>()
  for (const r of rows) if (!out.has(r.projectId)) out.set(r.projectId, r.createdAt)
  return out
}

/** Pure: the later of the newest activity row and the project's own updatedAt. */
export function lastActivityOf(row: { updatedAt: Date }, newestLog: Date | undefined): Date {
  return newestLog && newestLog.getTime() > row.updatedAt.getTime() ? newestLog : row.updatedAt
}

interface PermissionRow {
  members: ReadonlyArray<{ userId: string; role: string }>
  sections: ReadonlyArray<{ section: { id: string } }>
}

/** Pure: same policy as PATCH /api/projects/:id status ("project.update": admin, PO, SM). */
export function viewerCanUpdate(row: PermissionRow, scope: ProjectListScope): boolean {
  const member = row.members.find((m) => m.userId === scope.userId)
  return can(
    {
      userId: scope.userId,
      systemRole: scope.isAdmin ? "admin" : scope.sectionIds.length > 0 ? "section_manager" : "member",
      projectRole: member?.role ?? null,
      isSectionManagerOfProject: row.sections.some((s) => scope.sectionIds.includes(s.section.id)),
    },
    "project.update",
  )
}

/** Dates + permission for every listed project (one or two queries, never per project). */
export async function loadProjectListMeta(
  rows: ReadonlyArray<PermissionRow & { id: string; updatedAt: Date }>,
  scope: ProjectListScope,
  status: ProjectListStatus,
  db: Db = defaultDb,
): Promise<Map<string, ProjectListMeta>> {
  const ids = rows.map((r) => r.id)
  const [activity, archived] = await Promise.all([
    loadLastActivity(ids, db),
    status === "archived" ? loadArchivedAt(ids, db) : Promise.resolve(new Map<string, Date>()),
  ])
  return new Map(
    rows.map((r) => [
      r.id,
      { lastActivityAt: lastActivityOf(r, activity.get(r.id)), archivedAt: archived.get(r.id) ?? null, canUpdate: viewerCanUpdate(r, scope) },
    ]),
  )
}

/** Pure: flatten junction rows and surface the per-user favorite flag. */
export function toProjectListItem(row: ProjectListRow, i18n: EntityI18n | undefined, meta?: ProjectListMeta) {
  return {
    ...row,
    sections: row.sections.map((ps) => ps.section),
    isFavorite: row.favoritedBy.length > 0,
    i18n: i18n ?? {},
    lastActivityAt: meta?.lastActivityAt ?? row.updatedAt,
    archivedAt: meta?.archivedAt ?? null,
    canUpdate: meta?.canUpdate ?? false,
  }
}

export type ProjectListItem = ReturnType<typeof toProjectListItem>

/** Archived projects of the user's scope, ready for the list (with both-language names). */
export async function listArchivedProjects(user: ProjectListUser): Promise<ProjectListItem[]> {
  const scope = await loadProjectListScope(user)
  const rows = await findProjectList(scope, "archived")
  const [i18n, meta] = await Promise.all([getI18nFor("project", rows.map((p) => p.id)), loadProjectListMeta(rows, scope, "archived")])
  return rows.map((row) => toProjectListItem(row, i18n.get(row.id), meta.get(row.id)))
}
