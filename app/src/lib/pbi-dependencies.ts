/**
 * Pure helpers for PBI dependencies (finish-to-start: the predecessor must be
 * completed before the successor can start). Shared by the backlog card, the
 * PBI detail section / picker and the sprint picker.
 */
import type { Language } from "@/lib/i18n"
import { pickText } from "@/lib/translation/pick-text"
import type { PbiDependencyRefDto } from "@/types/api"

type Ref = PbiDependencyRefDto
interface WithDeps {
  id: string
  blockedBy?: readonly Ref[]
  blocking?: readonly Ref[]
}
export interface Edge {
  predecessorId: string
  successorId: string
}

export const isRefDone = (ref: Pick<Ref, "status">): boolean => ref.status === "completed"

/** Predecessors that are not completed yet (the PBI is "waiting" while this is non-empty). */
export function waitingOn(item: WithDeps): Ref[] {
  return (item.blockedBy ?? []).filter((r) => !isRefDone(r))
}

/** Successors still open (they wait for this PBI). */
export function openBlocking(item: WithDeps): Ref[] {
  return (item.blocking ?? []).filter((r) => !isRefDone(r))
}

/**
 * The lowest-ranked open predecessor that sits BELOW the item in `orderedIds`
 * (the item is prioritised before something it waits for), or null.
 */
export function orderConflict(item: WithDeps, orderedIds: readonly string[]): Ref | null {
  let worstPos = orderedIds.indexOf(item.id)
  if (worstPos < 0) return null
  let worst: Ref | null = null
  for (const ref of waitingOn(item)) {
    const pos = orderedIds.indexOf(ref.id)
    if (pos > worstPos) {
      worst = ref
      worstPos = pos
    }
  }
  return worst
}

/** New list with `itemId` placed right after `anchorId` (unchanged copy when either is missing). */
export function moveBelow<T extends { id: string }>(list: readonly T[], itemId: string, anchorId: string): T[] {
  const item = list.find((i) => i.id === itemId)
  if (!item || itemId === anchorId || !list.some((i) => i.id === anchorId)) return [...list]
  const rest = list.filter((i) => i.id !== itemId)
  const at = rest.findIndex((i) => i.id === anchorId) + 1
  return [...rest.slice(0, at), item, ...rest.slice(at)]
}

/** Every edge visible in a list response (each link appears on both ends; deduplicated). */
export function edgesOf(items: readonly WithDeps[]): Edge[] {
  const seen = new Map<string, Edge>()
  for (const item of items) {
    for (const r of item.blockedBy ?? []) seen.set(r.dependencyId, { predecessorId: r.id, successorId: item.id })
    for (const r of item.blocking ?? []) seen.set(r.dependencyId, { predecessorId: item.id, successorId: r.id })
  }
  return [...seen.values()]
}

/** Ids reachable from `start` following the edges forward ("down") or backward ("up"), cycle-safe. */
export function reachable(edges: readonly Edge[], start: string, direction: "down" | "up"): Set<string> {
  const next = new Map<string, string[]>()
  for (const e of edges) {
    const [from, to] = direction === "down" ? [e.predecessorId, e.successorId] : [e.successorId, e.predecessorId]
    next.set(from, [...(next.get(from) ?? []), to])
  }
  const seen = new Set<string>()
  const queue = [...(next.get(start) ?? [])]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (seen.has(cur)) continue
    seen.add(cur)
    queue.push(...(next.get(cur) ?? []))
  }
  return seen
}

export type PickMode = "blockedBy" | "blocking"
export type PickBlock = "self" | "existing" | "cycle"

/**
 * Candidates that cannot be picked for `selfId` with the reason. "blockedBy"
 * adds candidate → self, "blocking" adds self → candidate. Mirrors the
 * server guard (services/backlog/backlog.dependencies.ts) so a pick is never rejected.
 */
export function pickBlocks(edges: readonly Edge[], selfId: string, mode: PickMode): Map<string, PickBlock> {
  const out = new Map<string, PickBlock>()
  // A new edge closes a cycle when its target already reaches its source.
  for (const id of reachable(edges, selfId, mode === "blockedBy" ? "down" : "up")) out.set(id, "cycle")
  for (const e of edges) {
    if (mode === "blockedBy" && e.successorId === selfId) out.set(e.predecessorId, "existing")
    if (mode === "blocking" && e.predecessorId === selfId) out.set(e.successorId, "existing")
  }
  out.set(selfId, "self")
  return out
}

/** "#12 <title>" in the viewer's language (initiative, else user story; first line). */
export function refLabel(ref: Pick<Ref, "displayId" | "initiative" | "userStory" | "i18n">, language: Language): string {
  const title = pickText(ref.i18n, "initiative", ref.initiative, language).text || pickText(ref.i18n, "userStory", ref.userStory, language).text || ""
  const head = title.split(/\r?\n/, 1)[0].trim()
  return head ? `#${ref.displayId} ${head}` : `#${ref.displayId}`
}
