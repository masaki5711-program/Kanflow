import type { Prisma } from "@/generated/prisma/client"
import { recalcPlanItems } from "@/lib/plan-progress"
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

export interface SyncRow extends TaskState {
  /** Copies made of this task by a carry-over (absent / empty = none). */
  carriedCopies?: readonly unknown[]
}

/**
 * Pure: drops the unfinished tasks that a carry-over has taken into a later
 * sprint. The copy now stands for that work, so the original (kept in the
 * earlier sprint as its record) must not hold the PBI back from completing.
 * Deleting the copy clears the link and the original counts again.
 */
export function withoutSupersededTasks<T extends SyncRow>(rows: readonly T[]): T[] {
  return rows.filter((r) => !(isRealTask(r) && r.status !== "done" && (r.carriedCopies?.length ?? 0) > 0))
}

/**
 * Reconcile a PBI's `status` with the state of its sprint tasks (scanned
 * ACROSS sprints — a carried-over PBI isn't complete until every real task is
 * done, except an original that a carry-over has copied — see withoutSupersededTasks).
 * Runs after any sprint task create/update/delete and after a PBI is
 * removed from a sprint. Safe to call when the PBI no longer exists or is in
 * the trash (then nothing is written). Pass a
 * transaction client to run inside the caller's transaction.
 *
 * The PBI's master-plan item is recalculated afterwards EVEN WITHOUT a status
 * change: sprint membership alone moves a linked plan leaf to "in_progress".
 */
export async function syncPbiStatusFromTasks(pbItemId: string, db: Db = prisma): Promise<void> {
  const pbi = await db.productBacklogItem.findUnique({
    where: { id: pbItemId, deletedAt: null },
    select: { id: true, status: true, planItemId: true },
  })
  if (!pbi) return

  const rows = await db.sprintBacklogItem.findMany({
    where: { pbItemId },
    select: { taskName: true, status: true, carriedCopies: { select: { id: true }, take: 1 } },
  })
  const change = derivePbiStatusChange(pbi.status, withoutSupersededTasks(rows))
  // A status change is a real edit: bump the optimistic-lock version (P2).
  if (change) await db.productBacklogItem.update({ where: { id: pbItemId }, data: { ...change, version: { increment: 1 } } })
  if (pbi.planItemId) await recalcPlanItems([pbi.planItemId], db)
}
