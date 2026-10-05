/**
 * Immutable stage-tree operations of the template editor (buttons, no
 * drag). Paths are index arrays from the top ([] = the root list). Every
 * operation returns a new tree plus the path of the moved / created stage
 * (focus target), or null when the operation is not possible (edge, depth).
 */
import { TEMPLATE_MAX_DEPTH } from "./schema"

export interface StageLike<T> {
  children?: T[]
}

export type Path = readonly number[]

export interface OpResult<T> {
  nodes: T[]
  focus: number[]
}

/** The node at `path`, or undefined. */
export function nodeAt<T extends StageLike<T>>(nodes: readonly T[], path: Path): T | undefined {
  let list: readonly T[] = nodes
  let node: T | undefined
  for (const i of path) {
    node = list[i]
    if (!node) return undefined
    list = node.children ?? []
  }
  return node
}

/** Replace the sibling list under `parentPath` ([] = top level). */
function withChildren<T extends StageLike<T>>(nodes: readonly T[], parentPath: Path, fn: (list: T[]) => T[]): T[] {
  if (parentPath.length === 0) return fn([...nodes])
  const [head, ...rest] = parentPath
  return nodes.map((n, i) => (i === head ? { ...n, children: withChildren(n.children ?? [], rest, fn) } : n))
}

/** Depth of a subtree (the node itself = 1). */
export function subtreeDepth<T extends StageLike<T>>(node: T): number {
  return 1 + Math.max(0, ...(node.children ?? []).map((c) => subtreeDepth(c)))
}

/** Map the node at `path`. */
export function updateNode<T extends StageLike<T>>(nodes: readonly T[], path: Path, fn: (node: T) => T): T[] {
  const parent = path.slice(0, -1)
  const index = path[path.length - 1]
  return withChildren(nodes, parent, (list) => list.map((n, i) => (i === index ? fn(n) : n)))
}

export function removeNode<T extends StageLike<T>>(nodes: readonly T[], path: Path): OpResult<T> {
  const parent = path.slice(0, -1)
  const index = path[path.length - 1]
  const next = withChildren(nodes, parent, (list) => list.filter((_, i) => i !== index))
  const siblings = parent.length === 0 ? next : (nodeAt(next, parent)?.children ?? [])
  const focus = siblings.length === 0 ? parent : [...parent, Math.min(index, siblings.length - 1)]
  return { nodes: next, focus }
}

/** Insert `node` after `path` (same level), or at the end of the top level when `path` is null. */
export function insertAfter<T extends StageLike<T>>(nodes: readonly T[], path: Path | null, node: T): OpResult<T> {
  if (path === null || path.length === 0) return { nodes: [...nodes, node], focus: [nodes.length] }
  const parent = path.slice(0, -1)
  const index = path[path.length - 1] + 1
  return { nodes: withChildren(nodes, parent, (list) => [...list.slice(0, index), node, ...list.slice(index)]), focus: [...parent, index] }
}

/** Append `node` as the last child of `path`; null beyond TEMPLATE_MAX_DEPTH. */
export function appendChild<T extends StageLike<T>>(nodes: readonly T[], path: Path, node: T): OpResult<T> | null {
  if (path.length + 1 > TEMPLATE_MAX_DEPTH) return null
  const target = nodeAt(nodes, path)
  if (!target) return null
  const count = target.children?.length ?? 0
  return { nodes: updateNode(nodes, path, (n) => ({ ...n, children: [...(n.children ?? []), node] })), focus: [...path, count] }
}

/** Swap with the previous (-1) / next (+1) sibling. */
export function moveNode<T extends StageLike<T>>(nodes: readonly T[], path: Path, delta: -1 | 1): OpResult<T> | null {
  const parent = path.slice(0, -1)
  const index = path[path.length - 1]
  const siblings = parent.length === 0 ? nodes : (nodeAt(nodes, parent)?.children ?? [])
  const target = index + delta
  if (target < 0 || target >= siblings.length) return null
  const next = withChildren(nodes, parent, (list) => {
    const copy = [...list]
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
    return copy
  })
  return { nodes: next, focus: [...parent, target] }
}

/** Make the node the last child of its previous sibling (null at the first sibling or beyond the depth limit). */
export function indentNode<T extends StageLike<T>>(nodes: readonly T[], path: Path): OpResult<T> | null {
  const index = path[path.length - 1]
  if (index === 0) return null
  const node = nodeAt(nodes, path)
  if (!node || path.length + subtreeDepth(node) > TEMPLATE_MAX_DEPTH) return null
  const prevPath = [...path.slice(0, -1), index - 1]
  const removed = removeNode(nodes, path).nodes
  const result = appendChild(removed, prevPath, node)
  return result
}

/** Move the node right after its parent, one level up (null at the top level). */
export function outdentNode<T extends StageLike<T>>(nodes: readonly T[], path: Path): OpResult<T> | null {
  if (path.length < 2) return null
  const node = nodeAt(nodes, path)
  if (!node) return null
  const removed = removeNode(nodes, path).nodes
  return insertAfter(removed, path.slice(0, -1), node)
}
