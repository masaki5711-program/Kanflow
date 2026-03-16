import { prisma } from "@/lib/prisma"

/**
 * Recalculate a sprint's actualScore based on completed PBI work.
 *
 * Logic: For each unique PBI in the sprint, if ALL tasks for that PBI
 * are "done", then that PBI's workloadScore is added to the total.
 * Partially completed PBIs are not counted.
 */
export async function recalcSprintActualScore(sprintId: string): Promise<number> {
  const sprintItems = await prisma.sprintBacklogItem.findMany({
    where: { sprintId },
    select: {
      status: true,
      pbItem: { select: { id: true, workloadScore: true } },
    },
  })

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

  // Sum workloadScore for PBIs where all tasks are done
  let totalScore = 0
  for (const pbi of pbiMap.values()) {
    if (pbi.allDone) {
      totalScore += pbi.workloadScore
    }
  }

  // Update the sprint
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { actualScore: totalScore },
  })

  return totalScore
}
