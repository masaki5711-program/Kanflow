import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

type Db = Prisma.TransactionClient

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

export interface PlanNode {
  id: string
  parentId: string | null
  status: string
  progressPct: number
}

function depthOf(id: string, byId: ReadonlyMap<string, PlanNode>): number {
  let depth = 0
  const seen = new Set<string>()
  let cursor = byId.get(id)?.parentId ?? null
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    depth += 1
    cursor = byId.get(cursor)?.parentId ?? null
  }
  return depth
}

/**
 * Pure: recompute progress for the start items and every ancestor. Leaves
 * take their % from status; parents take the rounded average of their direct
 * children. Nodes are processed deepest-first so every parent sees its
 * children's fresh values. Returns only the rows whose % changed.
 */
export function computePlanProgressUpdates(
  nodes: readonly PlanNode[],
  startItemIds: readonly string[]
): Array<{ id: string; progressPct: number }> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id])
  }
  const touched = new Set<string>()
  for (const start of startItemIds) {
    let cursor: string | null = start
    while (cursor && byId.has(cursor) && !touched.has(cursor)) {
      touched.add(cursor)
      cursor = byId.get(cursor)?.parentId ?? null
    }
  }
  const order = Array.from(touched).sort((a, b) => depthOf(b, byId) - depthOf(a, byId))
  const progress = new Map(nodes.map((n) => [n.id, n.progressPct]))
  const updates: Array<{ id: string; progressPct: number }> = []
  for (const id of order) {
    const node = byId.get(id) as PlanNode
    const kids = children.get(id) ?? []
    const next = kids.length === 0
      ? statusToProgress(node.status)
      : Math.round(kids.reduce((acc, k) => acc + (progress.get(k) ?? 0), 0) / kids.length)
    if (next !== progress.get(id)) {
      progress.set(id, next)
      updates.push({ id, progressPct: next })
    }
  }
  return updates
}

/**
 * Recalculate `progressPct` for the given items and every ancestor up to the
 * root, with one read of the project's plan tree (no per-node queries).
 * Accepts old parent ids too, so "moved to a new parent" rebalances both
 * trees. Pass a transaction client to run inside the caller's transaction.
 */
export async function recalcPlanProgress(projectId: string, startItemIds: string[], db: Db = prisma): Promise<void> {
  if (startItemIds.filter(Boolean).length === 0) return
  const nodes = await db.planItem.findMany({
    where: { projectId },
    select: { id: true, parentId: true, status: true, progressPct: true },
  })
  const updates = computePlanProgressUpdates(nodes, startItemIds.filter(Boolean))
  for (const u of updates) {
    await db.planItem.update({ where: { id: u.id }, data: { progressPct: u.progressPct } })
  }
}
