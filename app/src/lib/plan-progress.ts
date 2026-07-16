import { prisma } from "@/lib/prisma"

/**
 * Map a leaf item's manual status to its progress percentage.
 * Progress is fully derived — users cannot type a raw % per item.
 */
export function statusToProgress(status: string): number {
  switch (status) {
    case "done":
      return 100
    case "in_progress":
    case "delayed":
      return 50
    case "not_started":
    case "on_hold":
    default:
      return 0
  }
}

/**
 * Recalculate `progressPct` for the given item and every ancestor up to the
 * root. Leaf items take their % from status; parents take the average of
 * their direct children (which themselves are kept up to date because we
 * walk depth-first from the touched node upward).
 *
 * Safe to call after any create/update/delete on a PlanItem — handles the
 * "moved to a new parent" case by accepting the OLD parent id too.
 */
export async function recalcPlanProgress(
  projectId: string,
  startItemIds: string[]
) {
  const visited = new Set<string>()
  const queue = [...startItemIds]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (!id || visited.has(id)) continue
    visited.add(id)

    const item = await prisma.planItem.findFirst({
      where: { id, projectId },
      include: { children: { select: { id: true, progressPct: true, status: true } } },
    })
    if (!item) continue

    let nextProgress: number
    if (item.children.length === 0) {
      nextProgress = statusToProgress(item.status)
    } else {
      const sum = item.children.reduce((acc, c) => acc + (c.progressPct ?? 0), 0)
      nextProgress = Math.round(sum / item.children.length)
    }

    if (nextProgress !== item.progressPct) {
      await prisma.planItem.update({
        where: { id },
        data: { progressPct: nextProgress },
      })
    }

    if (item.parentId) queue.push(item.parentId)
  }
}
