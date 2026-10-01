/**
 * Client mirror of the server's dependency guard (services/plan/plan.schedule.ts
 * assertValidDependency), so the successor picker can show why an item cannot
 * follow the predecessor instead of letting the server reject the pick.
 */
import type { PlanDependency, PlanItem } from "./plan-types"
import { ancestorIds, descendantIds } from "./tree"

/** Why an item cannot become a successor of the predecessor. */
export type SuccessorBlock = "self" | "hierarchy" | "existing" | "cycle"

/** Every item that reaches `target` over the dependency edges (reverse BFS, cycle-safe). */
export function upstreamOf(deps: readonly Pick<PlanDependency, "predecessorId" | "successorId">[], target: string): Set<string> {
  const prev = new Map<string, string[]>()
  for (const d of deps) prev.set(d.successorId, [...(prev.get(d.successorId) ?? []), d.predecessorId])
  const seen = new Set<string>()
  const queue = [...(prev.get(target) ?? [])]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (seen.has(cur)) continue
    seen.add(cur)
    queue.push(...(prev.get(cur) ?? []))
  }
  return seen
}

/**
 * Blocked successor candidates of `predecessorId` with the reason; an item
 * missing from the map can be picked. A pick would create a cycle when the
 * candidate already (transitively) precedes the predecessor.
 */
export function successorBlocks(items: readonly PlanItem[], deps: readonly PlanDependency[], predecessorId: string): Map<string, SuccessorBlock> {
  const out = new Map<string, SuccessorBlock>()
  for (const id of upstreamOf(deps, predecessorId)) out.set(id, "cycle")
  for (const d of deps) if (d.predecessorId === predecessorId) out.set(d.successorId, "existing")
  for (const id of [...ancestorIds(items, predecessorId), ...descendantIds(items, predecessorId)]) out.set(id, "hierarchy")
  out.set(predecessorId, "self")
  return out
}

/** Every item `source` reaches over the dependency edges (forward BFS, cycle-safe). */
export function downstreamOf(deps: readonly Pick<PlanDependency, "predecessorId" | "successorId">[], source: string): Set<string> {
  return upstreamOf(
    deps.map((d) => ({ predecessorId: d.successorId, successorId: d.predecessorId })),
    source,
  )
}

/**
 * The dependency chain through `id`: everything that must finish before it
 * and everything waiting for it, plus the item itself. Null when the item has
 * no dependencies (nothing to highlight).
 */
export function chainOf(deps: readonly Pick<PlanDependency, "predecessorId" | "successorId">[], id: string | null): Set<string> | null {
  if (!id) return null
  const chain = new Set([id, ...upstreamOf(deps, id), ...downstreamOf(deps, id)])
  return chain.size > 1 ? chain : null
}
