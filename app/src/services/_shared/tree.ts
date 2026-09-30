/** Minimal adjacency-list node (plan items, attachment folders). */
export interface TreeNode {
  id: string
  parentId: string | null
}

/**
 * True when making `newParentId` the parent of `id` would create a cycle
 * (including `newParentId === id`). Walks the in-memory tree, so callers load
 * the project's nodes once instead of querying per ancestor.
 */
export function wouldCreateCycle(nodes: readonly TreeNode[], id: string, newParentId: string): boolean {
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]))
  const seen = new Set<string>()
  let cursor: string | null = newParentId
  while (cursor && !seen.has(cursor)) {
    if (cursor === id) return true
    seen.add(cursor)
    cursor = parentOf.get(cursor) ?? null
  }
  return false
}

/** `rootId` plus every descendant (cycle-safe). */
export function collectSubtreeIds(nodes: readonly TreeNode[], rootId: string): string[] {
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id])
  }
  const out: string[] = []
  const seen = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    stack.push(...(children.get(id) ?? []))
  }
  return out
}
