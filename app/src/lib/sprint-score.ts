import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { isRealTask } from "@/lib/pbi-status-sync"

type Db = Prisma.TransactionClient

export interface ScoredTask {
  status: string
  taskName: string | null
  pbItem: { id: string; workloadScore: number | null }
}

/**
 * Pure rule: sum the workloadScore of every PBI whose real tasks (taskName
 * non-empty) are ALL "done". Partially completed PBIs and placeholder rows
 * (PBI-membership markers without a taskName) do not count.
 */
export function computeSprintActualScore(items: readonly ScoredTask[]): number {
  const byPbi = new Map<string, { workloadScore: number; allDone: boolean }>()
  for (const item of items) {
    if (!isRealTask(item)) continue
    const prev = byPbi.get(item.pbItem.id)
    const done = item.status === "done"
    byPbi.set(item.pbItem.id, {
      workloadScore: prev?.workloadScore ?? item.pbItem.workloadScore ?? 0,
      allDone: (prev?.allDone ?? true) && done,
    })
  }
  let total = 0
  for (const pbi of byPbi.values()) if (pbi.allDone) total += pbi.workloadScore
  return total
}

/**
 * Recalculate and store a sprint's actualScore from its tasks. Pass a
 * transaction client to run inside the caller's transaction.
 */
export async function recalcSprintActualScore(sprintId: string, db: Db = prisma): Promise<number> {
  const items = await db.sprintBacklogItem.findMany({
    where: { sprintId },
    select: {
      status: true,
      taskName: true,
      pbItem: { select: { id: true, workloadScore: true } },
    },
  })
  const totalScore = computeSprintActualScore(items)
  await db.sprint.update({ where: { id: sprintId }, data: { actualScore: totalScore } })
  return totalScore
}
