/**
 * Read-only REST API (/api/v1) use cases. Authorization happens in the route
 * wrapper (src/app/api/v1/_lib/v1-route.ts): by the time these run, the
 * token's user has `project.view` on `projectId`. Responses use the envelope
 * `{ data, nextCursor? }`; dates are ISO strings.
 */
import { toPage } from "@/services/_shared/cursor"
import { defaultDb } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import { listProjectActivity } from "@/services/activity/activity.service"
import type { ActivityDto } from "@/services/activity/activity.service"
import type { ProjectActivityQuery } from "@/services/activity/activity.schemas"
import { loadProjectListScope, projectListWhere } from "@/services/projects/project-list"
import * as repo from "./api-v1.repository"
import type { V1BacklogQuery, V1ProjectsQuery } from "./api-v1.schemas"

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

export async function listProjects(user: { id: string; role: string }, query: V1ProjectsQuery) {
  const scope = await loadProjectListScope(user)
  const rows = await repo.findProjects(defaultDb, projectListWhere(scope, query.status))
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

export async function listActivity(projectId: string, query: ProjectActivityQuery): Promise<V1Page<ActivityDto>> {
  const page = await listProjectActivity(projectId, query)
  return { data: page.items, nextCursor: page.nextCursor }
}
