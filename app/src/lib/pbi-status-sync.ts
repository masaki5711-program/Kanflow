import { prisma } from "@/lib/prisma"

/**
 * Reconcile a PBI's `status` with the state of its sprint tasks.
 *
 * Rule (Scrum-aligned: "PBI = a chunk of customer value, considered Done when
 * every task that delivers it is Done"):
 *  - If the PBI has ≥1 real task (taskName non-empty) AND every real task is
 *    in status="done"            → set PBI.status = "completed", completedAt = now
 *  - If the PBI is currently "completed" but at least one real task is back
 *    to "todo" / "in_progress"   → set PBI.status = "ready", completedAt = null
 *  - Otherwise (e.g. no real tasks yet, or mixed states on a non-completed
 *    PBI)                        → leave PBI status as-is
 *
 * This runs after any sprint task create/update/delete and after a PBI is
 * removed from a sprint. It is safe to call when the PBI no longer exists.
 */
export async function syncPbiStatusFromTasks(pbItemId: string): Promise<void> {
  const pbi = await prisma.productBacklogItem.findUnique({
    where: { id: pbItemId },
    select: { id: true, status: true },
  })
  if (!pbi) return

  // Pull all sprint-backlog rows tied to this PBI. We deliberately scan
  // ACROSS sprints — a PBI shouldn't normally span sprints, but if it does
  // (e.g. carried over), it isn't "complete" until every real task is done.
  const rows = await prisma.sprintBacklogItem.findMany({
    where: { pbItemId },
    select: { taskName: true, status: true },
  })
  const realTasks = rows.filter((r) => !!(r.taskName && r.taskName.trim().length > 0))

  if (realTasks.length === 0) {
    // No actionable tasks have been carved out yet — don't touch the PBI.
    return
  }

  const allDone = realTasks.every((r) => r.status === "done")

  if (allDone && pbi.status !== "completed") {
    await prisma.productBacklogItem.update({
      where: { id: pbItemId },
      data: { status: "completed", completedAt: new Date() },
    })
    return
  }

  // Auto-revert: if we previously auto-completed but now a task is back to a
  // non-done state, return the PBI to `ready` so the user sees it in the
  // active list again. We don't try to remember a "previous" status; a
  // sprint-tracked PBI was sprint-ready by definition.
  if (!allDone && pbi.status === "completed") {
    await prisma.productBacklogItem.update({
      where: { id: pbItemId },
      data: { status: "ready", completedAt: null },
    })
  }
}
