import type { TranslatableEntity } from "@/lib/translation/types"
import type { Db } from "./db"

/**
 * Who owns a translatable entity: a project (members may read it) or a single
 * user (personal fixed tasks). Used to authorize endpoints that address an
 * entity only by `(entityType, entityId)`, e.g. "translate now".
 */
export type EntityScope = { kind: "project"; projectId: string } | { kind: "user"; userId: string }

const project = (row: { projectId: string } | null): EntityScope | null =>
  row ? { kind: "project", projectId: row.projectId } : null

/** Resolve the owner of `(type, id)`; null when the entity does not exist. */
export async function resolveEntityScope(db: Db, type: TranslatableEntity, id: string): Promise<EntityScope | null> {
  const byId = { where: { id }, select: { projectId: true } } as const
  switch (type) {
    case "project":
      return (await db.project.findUnique({ where: { id }, select: { id: true } }))
        ? { kind: "project", projectId: id }
        : null
    case "product_goal":
      return project(await db.productGoal.findUnique(byId))
    case "icebox_item":
      return project(await db.iceboxItem.findUnique(byId))
    case "backlog_item":
      return project(await db.productBacklogItem.findUnique(byId))
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
