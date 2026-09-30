/**
 * Home-page numbers for Product Owners (A3-16): across the live projects the
 * user owns as PO — PBIs waiting for refinement (not ready), sprints waiting
 * for their review, and how far the running sprints' tasks are done.
 */
import { defaultDb, type Db } from "@/services/_shared/db"
import type { PoHomeSummary } from "./po-home-summary.types"

export { sprintCompletionPct, type PoHomeSummary } from "./po-home-summary.types"

/** Null when the user is PO of no live project. */
export async function loadPoHomeSummary(userId: string, db: Db = defaultDb): Promise<PoHomeSummary | null> {
  const memberships = await db.projectMember.findMany({
    where: { userId, role: "po", project: { status: "active", deletedAt: null } },
    select: { projectId: true },
  })
  const projectIds = [...new Set(memberships.map((m) => m.projectId))]
  if (projectIds.length === 0) return null
  const inProjects = { projectId: { in: projectIds } }
  // A PBI membership placeholder row has no task name; tasks of trashed PBIs are hidden everywhere.
  const runningTasks = {
    sprint: { ...inProjects, status: "active" },
    pbItem: { deletedAt: null },
    AND: [{ taskName: { not: null } }, { taskName: { not: "" } }],
  }
  const [notReady, inReview, activeSprints, totalTasks, doneTasks] = await Promise.all([
    db.productBacklogItem.count({ where: { ...inProjects, status: "not_ready", deletedAt: null } }),
    db.sprint.count({ where: { ...inProjects, status: "review" } }),
    db.sprint.count({ where: { ...inProjects, status: "active" } }),
    db.sprintBacklogItem.count({ where: runningTasks }),
    db.sprintBacklogItem.count({ where: { ...runningTasks, status: "done" } }),
  ])
  return { singleProjectId: projectIds.length === 1 ? projectIds[0] : null, notReady, inReview, activeSprints, totalTasks, doneTasks }
}
