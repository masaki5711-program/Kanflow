import type { TranslatableEntity } from "@/lib/translation/types"
import type { Db } from "./db"

/**
 * Who owns a translatable entity: a project (members may read it) or a single
 * user (personal fixed tasks). Used to authorize endpoints that address an
 * entity only by `(entityType, entityId)`, e.g. "translate now".
 * Trashed PBIs / Icebox items and everything inside a trashed project resolve
 * to null (= "not found"), like every other read path.
 */
export type EntityScope = { kind: "project"; projectId: string } | { kind: "user"; userId: string }

const project = (row: { projectId: string } | null): EntityScope | null =>
  row ? { kind: "project", projectId: row.projectId } : null

/** Like `project`, but a trashed row counts as missing. */
const liveProject = (row: { projectId: string; deletedAt: Date | null } | null): EntityScope | null =>
  row && row.deletedAt === null ? project(row) : null

/**
 * Resolve the owner of `(type, id)`; null when the entity does not exist, is
 * in the trash, or belongs to a trashed project.
 */
export async function resolveEntityScope(db: Db, type: TranslatableEntity, id: string): Promise<EntityScope | null> {
  const scope = await resolveOwner(db, type, id)
  if (scope?.kind !== "project") return scope
  const live = await db.project.findFirst({ where: { id: scope.projectId, deletedAt: null }, select: { id: true } })
  return live ? scope : null
}

async function resolveOwner(db: Db, type: TranslatableEntity, id: string): Promise<EntityScope | null> {
  const byId = { where: { id }, select: { projectId: true } } as const
  const byIdWithTrash = { where: { id }, select: { projectId: true, deletedAt: true } } as const
  switch (type) {
    case "project":
      return { kind: "project", projectId: id }
    case "product_goal":
      return project(await db.productGoal.findUnique(byId))
    case "icebox_item":
      return liveProject(await db.iceboxItem.findUnique(byIdWithTrash))
    case "backlog_item":
      return liveProject(await db.productBacklogItem.findUnique(byIdWithTrash))
    case "sprint":
      return project(await db.sprint.findUnique(byId))
    case "release_item":
      return project(await db.releaseBacklogItem.findUnique(byId))
    case "calendar_event":
      return project(await db.calendarEvent.findUnique(byId))
    case "plan_item":
      return project(await db.planItem.findUnique(byId))
    case "daily_scrum_note": {
      const row = await db.dailyScrumNote.findUnique({ where: { id }, select: { sprint: { select: { projectId: true } } } })
      return project(row?.sprint ?? null)
    }
    case "sprint_task": {
      const row = await db.sprintBacklogItem.findUnique({ where: { id }, select: { sprint: { select: { projectId: true } } } })
      return project(row?.sprint ?? null)
    }
    case "comment":
      // A deleted comment is a tombstone whose body is never shown.
      return liveProject(await db.comment.findUnique(byIdWithTrash))
    case "fixed_task": {
      const row = await db.userFixedTask.findUnique({ where: { id }, select: { userId: true } })
      return row ? { kind: "user", userId: row.userId } : null
    }
    case "fixed_task_item": {
      const row = await db.userFixedTaskItem.findUnique({ where: { id }, select: { group: { select: { userId: true } } } })
      return row ? { kind: "user", userId: row.group.userId } : null
    }
  }
}
