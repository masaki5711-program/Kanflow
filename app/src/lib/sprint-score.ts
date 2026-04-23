import { prisma } from "@/lib/prisma"

/**
 * Recalculate a sprint's actualScore based on completed PBI work.
 *
 * Logic: For each unique PBI in the sprint that has at least one real task,
 * if ALL real tasks for that PBI are "done", then that PBI's workloadScore
 * is added to the total. Partially completed PBIs are not counted.
 *
 * Placeholder items (those with no taskName) are PBI-membership markers
 * created at sprint creation time and must be excluded from this calculation.
 */
export async function recalcSprintActualScore(sprintId: string): Promise<number> {
  const rawItems = await prisma.sprintBacklogItem.findMany({
    where: { sprintId },
    select: {
      status: true,
      taskName: true,
      pbItem: { select: { id: true, workloadScore: true } },
    },
  })

  const sprintItems = rawItems.filter((i) => !!(i.taskName && i.taskName.trim().length > 0))

  // Group tasks by PBI
  const pbiMap = new Map<string, { workloadScore: number; allDone: boolean }>()

  for (const item of sprintItems) {
    const pbiId = item.pbItem.id
    const existing = pbiMap.get(pbiId)
    if (existing) {
      if (item.status !== "done") {
        existing.allDone = false
      }
    } else {
      pbiMap.set(pbiId, {
        workloadScore: item.pbItem.workloadScore ?? 0,
        allDone: item.status === "done",
      })
    }
  }

  // Sum workloadScore for PBIs where all real tasks are done
  let totalScore = 0
  for (const pbi of pbiMap.values()) {
    if (pbi.allDone) {
      totalScore += pbi.workloadScore
    }
  }

  await prisma.sprint.update({
    where: { id: sprintId },
    data: { actualScore: totalScore },
  })

  return totalScore
}
