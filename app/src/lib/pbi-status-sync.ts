import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

type Db = Prisma.TransactionClient

export interface TaskState {
  taskName: string | null
  status: string
}

export type PbiStatusChange =
  | { status: "completed"; completedAt: Date }
  | { status: "ready"; completedAt: null }
  | null

/** Placeholder rows (no taskName) only mark PBI membership in a sprint. */
export function isRealTask(t: Pick<TaskState, "taskName">): boolean {
  return !!(t.taskName && t.taskName.trim().length > 0)
}

/**
 * Pure rule (Scrum-aligned: "PBI = a chunk of customer value, considered Done
 * when every task that delivers it is Done"):
 *  - ≥1 real task AND every real task done       → "completed", completedAt = now
 *  - PBI "completed" but a real task is not done  → "ready", completedAt = null
 *  - otherwise (no real tasks yet, mixed states)  → no change (null)
 */
export function derivePbiStatusChange(currentStatus: string, tasks: readonly TaskState[], now: Date = new Date()): PbiStatusChange {
  const realTasks = tasks.filter(isRealTask)
  if (realTasks.length === 0) return null
  const allDone = realTasks.every((r) => r.status === "done")
  if (allDone && currentStatus !== "completed") return { status: "completed", completedAt: now }
  // Auto-revert: a sprint-tracked PBI was sprint-ready by definition.
  if (!allDone && currentStatus === "completed") return { status: "ready", completedAt: null }
  return null
}

/**
 * Reconcile a PBI's `status` with the state of its sprint tasks (scanned
 * ACROSS sprints — a carried-over PBI isn't complete until every real task is
 * done). Runs after any sprint task create/update/delete and after a PBI is
 * removed from a sprint. Safe to call when the PBI no longer exists or is in
 * the trash (then nothing is written). Pass a
 * transaction client to run inside the caller's transaction.
 */
export async function syncPbiStatusFromTasks(pbItemId: string, db: Db = prisma): Promise<void> {
  const pbi = await db.productBacklogItem.findUnique({
    where: { id: pbItemId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!pbi) return

  const rows = await db.sprintBacklogItem.findMany({
    where: { pbItemId },
    select: { taskName: true, status: true },
  })
  const change = derivePbiStatusChange(pbi.status, rows)
  if (!change) return
  await db.productBacklogItem.update({ where: { id: pbItemId }, data: change })
}
