/**
 * Pure tree helpers for plan items: flattening for display, filtering with
 * ancestors kept, and structural moves (reorder / indent / outdent / drop)
 * expressed as POST /plan/reorder updates.
 */
import type { PlanItem, ReorderUpdate } from "./plan-types"

/** Which structural moves apply to a row (mirrors moveSibling / indentItem / outdentItem). */
export interface RowMoves {
  up: boolean
  down: boolean
  indent: boolean
  outdent: boolean
}

export interface FlatRow {
  item: PlanItem
  depth: number
  hasChildren: boolean
  moves: RowMoves
}

function movesOf(siblings: readonly PlanItem[], idx: number): RowMoves {
  const me = siblings[idx]
  const prev = siblings[idx - 1]
  return { up: idx > 0, down: idx < siblings.length - 1, indent: !!prev && !prev.isMilestone, outdent: !!me.parentId }
}

export function childrenByParent(items: readonly PlanItem[]): Map<string | null, PlanItem[]> {
  const map = new Map<string | null, PlanItem[]>()
  for (const it of items) {
    const list = map.get(it.parentId) ?? []
    list.push(it)
    map.set(it.parentId, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  return map
}

/**
 * Depth-first rows in sortOrder. Children of `collapsed` ids are skipped; when
 * `visible` is given only those ids are emitted (see filterVisibleIds).
 */
export function buildFlatTree(
  items: readonly PlanItem[],
  collapsed: ReadonlySet<string>,
  visible?: ReadonlySet<string> | null,
): FlatRow[] {
  const byParent = childrenByParent(items)
  const rows: FlatRow[] = []
  const walk = (parentId: string | null, depth: number) => {
    const siblings = byParent.get(parentId) ?? []
    siblings.forEach((it, idx) => {
      if (visible && !visible.has(it.id)) return
      const hasChildren = (byParent.get(it.id)?.length ?? 0) > 0
      rows.push({ item: it, depth, hasChildren, moves: movesOf(siblings, idx) })
      if (hasChildren && !collapsed.has(it.id)) walk(it.id, depth + 1)
    })
  }
  walk(null, 0)
  return rows
}

export function descendantIds(items: readonly PlanItem[], id: string): string[] {
  const byParent = childrenByParent(items)
  const out: string[] = []
  const walk = (pid: string) => {
    for (const c of byParent.get(pid) ?? []) {
      out.push(c.id)
      walk(c.id)
    }
  }
  walk(id)
  return out
}

export function ancestorIds(items: readonly PlanItem[], id: string): string[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const out: string[] = []
  let cur = byId.get(id)?.parentId ?? null
  while (cur && !out.includes(cur)) {
    out.push(cur)
    cur = byId.get(cur)?.parentId ?? null
  }
  return out
}

/** Ids of matching items plus their ancestors (so matches stay reachable in the tree). */
export function filterVisibleIds(items: readonly PlanItem[], matches: (item: PlanItem) => boolean): Set<string> {
  const out = new Set<string>()
  for (const it of items) {
    if (!matches(it)) continue
    out.add(it.id)
    for (const a of ancestorIds(items, it.id)) out.add(a)
  }
  return out
}

/** Items with at least one child (summary rows). */
export function parentIds(items: readonly PlanItem[]): Set<string> {
  return new Set(items.flatMap((i) => (i.parentId ? [i.parentId] : [])))
}

function siblingsOf(items: readonly PlanItem[], parentId: string | null): PlanItem[] {
  return childrenByParent(items).get(parentId) ?? []
}

/** Updates that give `ordered` the sortOrders 1..n under `parentId` (unchanged rows omitted). */
function renumber(ordered: readonly PlanItem[], parentId: string | null): ReorderUpdate[] {
  return ordered.flatMap((it, i) =>
    it.sortOrder === i + 1 && it.parentId === parentId ? [] : [{ id: it.id, parentId, sortOrder: i + 1 }],
  )
}

export function moveSibling(items: readonly PlanItem[], id: string, direction: "up" | "down"): ReorderUpdate[] | null {
  const me = items.find((i) => i.id === id)
  if (!me) return null
  const list = siblingsOf(items, me.parentId)
  const idx = list.findIndex((s) => s.id === id)
  const target = direction === "up" ? idx - 1 : idx + 1
  if (target < 0 || target >= list.length) return null
  const next = [...list]
  next.splice(idx, 1)
  next.splice(target, 0, me)
  return renumber(next, me.parentId)
}

/** Make the item the last child of its previous sibling (never under a milestone). */
export function indentItem(items: readonly PlanItem[], id: string): ReorderUpdate[] | null {
  const me = items.find((i) => i.id === id)
  if (!me) return null
  const list = siblingsOf(items, me.parentId)
  const idx = list.findIndex((s) => s.id === id)
  const newParent = list[idx - 1]
  if (!newParent || newParent.isMilestone) return null
  const children = siblingsOf(items, newParent.id)
  const last = children.length ? children[children.length - 1].sortOrder : 0
  return [{ id, parentId: newParent.id, sortOrder: last + 1 }]
}

/** Move the item next to (right after) its parent. */
export function outdentItem(items: readonly PlanItem[], id: string): ReorderUpdate[] | null {
  const me = items.find((i) => i.id === id)
  const parent = me?.parentId ? items.find((i) => i.id === me.parentId) : undefined
  if (!me || !parent) return null
  const list = siblingsOf(items, parent.parentId).filter((s) => s.id !== id)
  const at = list.findIndex((s) => s.id === parent.id) + 1
  const next = [...list.slice(0, at), me, ...list.slice(at)]
  return renumber(next, parent.parentId)
}

/** Drop `dragId` before/after `targetId` (as its sibling). Null when it would land inside itself. */
export function dropItem(
  items: readonly PlanItem[],
  dragId: string,
  targetId: string,
  position: "before" | "after",
): ReorderUpdate[] | null {
  if (dragId === targetId) return null
  const me = items.find((i) => i.id === dragId)
  const target = items.find((i) => i.id === targetId)
  if (!me || !target) return null
  if (descendantIds(items, dragId).includes(targetId)) return null
  const list = siblingsOf(items, target.parentId).filter((s) => s.id !== dragId)
  const at = list.findIndex((s) => s.id === targetId) + (position === "after" ? 1 : 0)
  const next = [...list.slice(0, at), me, ...list.slice(at)]
  const updates = renumber(next, target.parentId)
  return updates.length ? updates : null
}

export function applyUpdates(items: readonly PlanItem[], updates: readonly ReorderUpdate[]): PlanItem[] {
  const byId = new Map(updates.map((u) => [u.id, u]))
  return items.map((it) => {
    const u = byId.get(it.id)
    return u ? { ...it, parentId: u.parentId, sortOrder: u.sortOrder } : it
  })
}
