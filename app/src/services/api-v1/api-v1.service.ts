/**
 * REST API (/api/v1) read use cases (writes reuse the UI services through
 * src/app/api/v1/_lib/v1-write.ts). Authorization happens in the route
 * wrapper (src/app/api/v1/_lib/v1-route.ts): by the time these run, the
 * token's user has `project.view` on `projectId`. Responses use the envelope
 * `{ data, nextCursor? }`; dates are ISO strings.
 */
import type { Actor } from "@/services/_shared/actor"
import { toPage } from "@/services/_shared/cursor"
import { defaultDb } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { listProjectActivity } from "@/services/activity/activity.service"
import type { ActivityDto } from "@/services/activity/activity.service"
import type { ProjectActivityQuery } from "@/services/activity/activity.schemas"
import { loadProjectListScope, projectListWhere } from "@/services/projects/project-list"
import * as repo from "./api-v1.repository"
import type { V1BacklogQuery, V1ProjectsQuery } from "./api-v1.schemas"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"

export interface V1Envelope<T> {
  data: T
}

export interface V1Page<T> extends V1Envelope<T[]> {
  nextCursor: string | null
}

type Iso<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] }

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

/** Pure: Date fields of a flat row → ISO strings (new object). */
function isoDates<T extends Record<string, unknown>>(row: T): Iso<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v
  return out as Iso<T>
}

export async function getMe(userId: string) {
  const me = await repo.findMe(defaultDb, userId)
  if (!me) throw new NotFoundError()
  return { data: me }
}

/** `projectIds` = the token's project restriction (null = none). */
export async function listProjects(user: { id: string; role: string }, query: V1ProjectsQuery, projectIds: string[] | null = null) {
  const scope = await loadProjectListScope(user)
  const where = projectListWhere(scope, query.status)
  const rows = await repo.findProjects(defaultDb, projectIds ? { AND: [where, { id: { in: projectIds } }] } : where)
  return { data: rows.map(isoDates) }
}

export async function getProject(projectId: string) {
  const row = await repo.findProject(defaultDb, projectId)
  if (!row) throw new NotFoundError()
  const { sections, members, ...project } = row
  return {
    data: {
      ...isoDates(project),
      sections: sections.map((s) => s.section),
      members: members.map((m) => ({ userId: m.user.id, name: m.user.name, role: m.role })),
    },
  }
}

export async function listBacklog(projectId: string, query: V1BacklogQuery) {
  const rows = await repo.findBacklogPage(defaultDb, projectId, query)
  const page = toPage(rows, query.limit, isoDates)
  return { data: page.items, nextCursor: page.nextCursor }
}

/** `ref`: the PBI id, its display number ("12") or "PBI-12". */
export function parsePbiRef(ref: string): { id: string } | { displayId: number } {
  const m = /^(?:pbi-?)?(\d{1,9})$/i.exec(ref.trim())
  return m ? { displayId: Number(m[1]) } : { id: ref }
}

export async function getPbi(projectId: string, ref: string) {
  const row = await repo.findPbi(defaultDb, projectId, parsePbiRef(ref))
  if (!row) throw new NotFoundError("PBI not found", {}, "PBI_NOT_FOUND")
  const { sprintItems, ...pbi } = row
  return {
    data: {
      ...isoDates(pbi),
      tasks: sprintItems.map(({ assignees, ...t }) => ({ ...t, assignees: assignees.map((a) => a.user) })),
    },
  }
}

/** The service actor of a token request: the owner, marked `via: "api"` for the activity log. */
export async function loadApiActor(principal: Pick<ApiPrincipal, "userId" | "role">): Promise<Actor> {
  const user = await repo.findUserName(defaultDb, principal.userId)
  return { userId: principal.userId, userName: user?.name ?? null, systemRole: principal.role, via: "api" }
}

export async function listSprints(projectId: string) {
  const rows = await repo.findSprints(defaultDb, projectId)
  return { data: rows.map(({ sprintName, ...s }) => ({ ...isoDates(s), name: sprintName })) }
}

export async function listSprintTasks(projectId: string, sprintId: string) {
  if (!(await repo.findSprintId(defaultDb, projectId, sprintId))) throw new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND")
  const rows = await repo.findSprintTasks(defaultDb, sprintId)
  return {
    data: rows.map(({ pbItem, assignees, ...task }) => ({
      ...isoDates(task),
      pbi: { id: pbItem.id, displayId: pbItem.displayId },
      assignees: assignees.map((a) => a.user),
    })),
  }
}

export async function listPlan(projectId: string) {
  const rows = await repo.findPlanItems(defaultDb, projectId)
  return { data: rows.map(isoDates) }
}

export async function listReleases(projectId: string) {
  const rows = await repo.findReleases(defaultDb, projectId)
  return {
    data: rows.map(({ pbItem, releaseDate, ...r }) => ({
      ...isoDates(r),
      releaseDate: iso(releaseDate),
      // A release item is a copy: it stays when its PBI is trashed, but the link is hidden.
      pbi: pbItem && pbItem.deletedAt === null ? { id: pbItem.id, displayId: pbItem.displayId } : null,
    })),
  }
}

// ------------------------------------------------ Kanflow MCP (/api/mcp)

export type V1EntityKind = "pbi" | "sprint" | "task" | "icebox"

/**
 * The project (and, for a task, the sprint) that holds an entity, or null
 * when there is no such live entity. No access check: the caller MUST pass
 * the project to resolveV1ProjectActor (token project restriction + role).
 */
export async function locateEntity(kind: V1EntityKind, id: string): Promise<{ projectId: string; sprintId?: string } | null> {
  switch (kind) {
    case "pbi":
      return repo.findPbiProjectId(defaultDb, id)
    case "sprint":
      return repo.findSprintProjectId(defaultDb, id)
    case "icebox":
      return repo.findIceboxProjectId(defaultDb, id)
    case "task": {
      const row = await repo.findTaskLocation(defaultDb, id)
      return row ? { projectId: row.sprint.projectId, sprintId: row.sprintId } : null
    }
  }
}

/**
 * Pure: a git remote as `git remote get-url origin` prints it → the https
 * form parseRepoUrl understands. `ssh://git@host:2222/g/r.git` and
 * `git@host:g/r.git` become `https://host/g/r.git`; credentials embedded in
 * an https remote (`https://user:token@host/...`) and http are dropped / upgraded.
 * Only used to look up registered repositories (no request is made to it).
 */
export function normalizeRemoteUrl(raw: string): string {
  const input = raw.trim()
  if (!/^(ssh|https?):\/\//i.test(input)) return input
  try {
    const url = new URL(input)
    return `https://${url.hostname}${url.pathname}`
  } catch {
    return input
  }
}

/** A list cut at `limit`: `truncated` says more rows exist. */
export interface V1Bounded<T> {
  items: T[]
  truncated: boolean
  limit: number
}

function bounded<T>(rows: T[], limit: number): V1Bounded<T> {
  return { items: rows.slice(0, limit), truncated: rows.length > limit, limit }
}

/** Projects with a registered GitLab repository at `location` (no access check: see locateEntity). */
export async function findProjectsByRepository(location: { apiBase: string; repoPath: string }) {
  const rows = await repo.findRepositoriesAt(defaultDb, location.apiBase, location.repoPath)
  const page = bounded(rows, repo.V1_REPOSITORY_MATCH_LIMIT)
  return {
    ...page,
    items: page.items.map((r) => ({ projectId: r.projectId, projectName: r.project.name, repository: { name: r.name, webUrl: r.webUrl } })),
  }
}

/**
 * Tasks assigned to the user in open sprints (planning / active / review),
 * oldest first, at most V1_MY_TASKS_LIMIT (`truncated` when cut). `projectIds`
 * null = any active project (no access check: the caller filters each
 * project through resolveV1ProjectActor).
 */
export async function listMyTasks(userId: string, projectIds: string[] | null, includeDone: boolean) {
  if (projectIds && projectIds.length === 0) return { data: [], truncated: false, limit: repo.V1_MY_TASKS_LIMIT }
  const rows = await repo.findMyTasks(defaultDb, userId, projectIds, includeDone)
  const page = bounded(rows, repo.V1_MY_TASKS_LIMIT)
  return {
    truncated: page.truncated,
    limit: page.limit,
    data: page.items.map(({ pbItem, sprint, ...task }) => ({
      ...isoDates(task),
      projectId: sprint.projectId,
      sprint: { id: sprint.id, name: sprint.sprintName, status: sprint.status },
      pbi: { id: pbItem.id, displayId: pbItem.displayId, title: pbItem.initiative || pbItem.userStory?.slice(0, 120) || null },
    })),
  }
}

export async function listActivity(projectId: string, query: ProjectActivityQuery): Promise<V1Page<ActivityDto>> {
  const page = await listProjectActivity(projectId, query)
  return { data: page.items, nextCursor: page.nextCursor }
}
