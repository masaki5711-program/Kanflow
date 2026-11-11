import type { Patch } from "./doc"
import type { ElementMap } from "./geometry"
import { BOARD_LIMITS } from "./limits"
import { isBox, isLine, type BoardElement, type BoxElement } from "./model"
import { newBox, newLine, nextZ } from "./ops"

/**
 * Mind map on plain elements: a node is a box, and a branch is a curved line from the parent's right side to the
 * child's left side (both attached). Nothing else marks a mind map, so a node can be edited, styled and moved
 * like any other box. Pure.
 */

export const MIND_GAP_X = 60
export const MIND_GAP_Y = 16
/** Deepest level the tidy-up follows (a cycle drawn by hand is cut there too). */
const MAX_DEPTH = 30

function isBranch(el: BoardElement | undefined, elements: ElementMap): boolean {
  return isLine(el) && !!el.start.attach && !!el.end.attach && isBox(elements[el.start.attach]) && isBox(elements[el.end.attach]) && el.start.side === "e" && el.end.side === "w"
}

/** The children of a node, top to bottom. */
export function mindChildren(elements: ElementMap, id: string): BoxElement[] {
  const out: BoxElement[] = []
  for (const el of Object.values(elements)) {
    if (isBranch(el, elements) && isLine(el) && el.start.attach === id) {
      const child = elements[el.end.attach as string]
      if (isBox(child) && child.id !== id) out.push(child)
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x)
}

/** The parent of a node, or null for a root / a box that is no mind-map node. */
export function mindParent(elements: ElementMap, id: string): BoxElement | null {
  for (const el of Object.values(elements)) {
    if (isBranch(el, elements) && isLine(el) && el.end.attach === id) {
      const parent = elements[el.start.attach as string]
      if (isBox(parent) && parent.id !== id) return parent
    }
  }
  return null
}

function nodeSize(from: BoxElement): { w: number; h: number } {
  return { w: Math.min(Math.max(from.w, 80), 200), h: Math.min(Math.max(from.h, 40), 80) }
}

function addNode(elements: ElementMap, parent: BoxElement, at: { x: number; y: number }, makeId: () => string): { patch: Patch; id: string } {
  const id = makeId()
  const lineId = makeId()
  const z = nextZ(elements)
  const type = parent.type === "sticky" ? "sticky" : parent.type === "ellipse" ? "ellipse" : "rect"
  const { w, h } = nodeSize(parent)
  const box = newBox(type, { x: at.x, y: at.y, w, h }, id, Math.min(BOARD_LIMITS.counter, z + 1), { fill: parent.fill, stroke: parent.stroke })
  const start = { x: parent.x + parent.w, y: parent.y + parent.h / 2 }
  const end = { x: box.x, y: box.y + box.h / 2 }
  const line = { ...newLine("line", { point: start, attach: parent.id, side: "e" }, { point: end, attach: id, side: "w" }, lineId, z, parent.stroke), route: "curve" as const }
  return { patch: { [lineId]: line, [id]: box }, id }
}

/** A new child of `parentId`, below its last child (Tab). */
export function mindChildPatch(elements: ElementMap, parentId: string, makeId: () => string): { patch: Patch; id: string } | null {
  const parent = elements[parentId]
  if (!isBox(parent)) return null
  const children = mindChildren(elements, parentId)
  const last = children[children.length - 1]
  const x = parent.x + parent.w + MIND_GAP_X
  const y = last ? last.y + last.h + MIND_GAP_Y : parent.y + parent.h / 2 - nodeSize(parent).h / 2
  return addNode(elements, parent, { x, y }, makeId)
}

/** A new sibling of `id` right below the lowest of its siblings (Enter on a node that has a parent). */
export function mindSiblingPatch(elements: ElementMap, id: string, makeId: () => string): { patch: Patch; id: string } | null {
  const node = elements[id]
  const parent = mindParent(elements, id)
  if (!isBox(node) || !parent) return null
  const siblings = mindChildren(elements, parent.id)
  const lowest = siblings.reduce((max, s) => Math.max(max, s.y + s.h), node.y + node.h)
  return addNode(elements, parent, { x: node.x, y: lowest + MIND_GAP_Y }, makeId)
}

/** The root of the tree `id` belongs to (following parents, at most MAX_DEPTH levels up). */
export function mindRoot(elements: ElementMap, id: string): string {
  let current = id
  const seen = new Set([id])
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const parent = mindParent(elements, current)
    if (!parent || seen.has(parent.id)) break
    seen.add(parent.id)
    current = parent.id
  }
  return current
}

/**
 * Tidies the tree of `id`: the root stays, every level sits MIND_GAP_X right of its parent and the children of a
 * node are stacked around its middle. Locked nodes stay where they are (their subtree is still laid out).
 */
export function mindLayoutPatch(elements: ElementMap, id: string): Patch {
  const rootId = mindRoot(elements, id)
  const root = elements[rootId]
  if (!isBox(root)) return {}
  const patch: Record<string, BoardElement> = {}
  const seen = new Set<string>([rootId])
  const kids = new Map<string, BoxElement[]>()
  const childrenOf = (nodeId: string, depth: number): BoxElement[] => {
    if (depth >= MAX_DEPTH) return []
    if (!kids.has(nodeId)) kids.set(nodeId, mindChildren(elements, nodeId).filter((c) => !seen.has(c.id) && (seen.add(c.id), true)))
    return kids.get(nodeId) ?? []
  }
  const heights = new Map<string, number>()
  const height = (node: BoxElement, depth: number): number => {
    const children = childrenOf(node.id, depth)
    const stacked = children.reduce((sum, c, i) => sum + height(c, depth + 1) + (i > 0 ? MIND_GAP_Y : 0), 0)
    const h = Math.max(node.h, stacked)
    heights.set(node.id, h)
    return h
  }
  height(root, 0)
  const place = (node: BoxElement, x: number, centerY: number) => {
    const placed = node.locked ? node : { ...node, x: Math.round(x), y: Math.round(centerY - node.h / 2) }
    if (placed !== node && (placed.x !== node.x || placed.y !== node.y)) patch[node.id] = placed
    const children = kids.get(node.id) ?? []
    const total = children.reduce((sum, c, i) => sum + (heights.get(c.id) ?? c.h) + (i > 0 ? MIND_GAP_Y : 0), 0)
    // Around the node's real middle (a locked node stays where it is).
    const middle = placed.y + placed.h / 2
    let y = middle - total / 2
    for (const child of children) {
      const h = heights.get(child.id) ?? child.h
      place(child, placed.x + placed.w + MIND_GAP_X, y + h / 2)
      y += h + MIND_GAP_Y
    }
  }
  place(root, root.x, root.y + root.h / 2)
  return patch
}
