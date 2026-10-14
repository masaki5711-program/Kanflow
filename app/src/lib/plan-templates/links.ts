/**
 * Dependencies between the stages of a plan template (先行 → 後続, finish to
 * start): the same rules the project plan enforces (no self link, no link
 * between a stage and its own ancestor / descendant, no duplicate, no cycle),
 * so a template can always be loaded into 全体計画 without a rejected link.
 * Pure and client-safe. Stages are referenced by `key`, never by position,
 * so reordering or indenting a stage keeps its links.
 */

export interface TemplateLink {
  /** Key of the predecessor stage. */
  from: string
  /** Key of the successor stage. */
  to: string
}

interface KeyedStage {
  key?: string
  children?: readonly KeyedStage[]
}

/** Why `to` cannot follow `from` (null = it can). */
export type LinkBlock = "self" | "unknown" | "hierarchy" | "existing" | "cycle"

/** The reasons worth telling the user (a link to itself or to a missing stage cannot be attempted from the UI). */
export type RefusedLink = Exclude<LinkBlock, "self" | "unknown">

/** Keyed stages with the keys of their keyed ancestors; `duplicates` are keys used more than once. */
export function indexStageKeys(stages: readonly KeyedStage[]): { ancestors: Map<string, string[]>; duplicates: string[] } {
  const ancestors = new Map<string, string[]>()
  const duplicates: string[] = []
  const walk = (list: readonly KeyedStage[], chain: readonly string[]): void => {
    for (const node of list) {
      const next = node.key ? [...chain, node.key] : chain
      if (node.key) {
        if (ancestors.has(node.key)) duplicates.push(node.key)
        else ancestors.set(node.key, [...chain])
      }
      walk(node.children ?? [], next)
    }
  }
  walk(stages, [])
  return { ancestors, duplicates }
}

/** True when `target` is reachable from `source` over the links (cycle-safe). */
function reaches(links: readonly TemplateLink[], source: string, target: string): boolean {
  const next = new Map<string, string[]>()
  for (const l of links) next.set(l.from, [...(next.get(l.from) ?? []), l.to])
  const seen = new Set<string>()
  const queue = [source]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (cur === target) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    queue.push(...(next.get(cur) ?? []))
  }
  return false
}

/** Why the link from → to is not allowed given the stages and the existing links (null = allowed). */
export function linkBlock(stages: readonly KeyedStage[], links: readonly TemplateLink[], from: string, to: string): LinkBlock | null {
  if (from === to) return "self"
  const { ancestors } = indexStageKeys(stages)
  if (!ancestors.has(from) || !ancestors.has(to)) return "unknown"
  if (ancestors.get(from)?.includes(to) || ancestors.get(to)?.includes(from)) return "hierarchy"
  if (links.some((l) => l.from === from && l.to === to)) return "existing"
  if (reaches(links, to, from)) return "cycle"
  return null
}

/**
 * The first reason the whole link list is invalid, or null. Links are added
 * one by one, so a cycle is reported at the link that closes it.
 */
export function firstLinkProblem(stages: readonly KeyedStage[], links: readonly TemplateLink[]): string | null {
  const { duplicates } = indexStageKeys(stages)
  if (duplicates.length > 0) return `Duplicate stage key: ${duplicates[0]}`
  const accepted: TemplateLink[] = []
  for (const l of links) {
    const block = linkBlock(stages, accepted, l.from, l.to)
    if (block) return `Invalid dependency ${l.from} -> ${l.to} (${block})`
    accepted.push(l)
  }
  return null
}

/** The links whose two ends are both in `keys` (after a stage was removed). */
export function pruneLinks(links: readonly TemplateLink[], keys: ReadonlySet<string>): TemplateLink[] {
  return links.filter((l) => keys.has(l.from) && keys.has(l.to))
}
