/**
 * Pure tree helpers of plan templates: stage paths (the preview's checkbox
 * ids), the rows a template load inserts, and the 完了条件 ⇄ notes format.
 *
 * A path is the dot-joined sibling indexes from the top: "0", "0.2", "0.2.1".
 * Excluding a path excludes its whole subtree.
 */
import type { TemplateNode } from "./schema"

export interface FlatStage {
  path: string
  parentPath: string | null
  /** Top level = 0. */
  depth: number
  node: TemplateNode
}

/** Depth-first (display order) list of every stage with its path. */
export function flattenStages(nodes: readonly TemplateNode[], parentPath: string | null = null, depth = 0): FlatStage[] {
  return nodes.flatMap((node, i) => {
    const path = parentPath === null ? String(i) : `${parentPath}.${i}`
    return [{ path, parentPath, depth, node }, ...flattenStages(node.children ?? [], path, depth + 1)]
  })
}

/** True when `path` or one of its ancestors is excluded. */
export function isExcluded(path: string, excluded: ReadonlySet<string>): boolean {
  const parts = path.split(".")
  return parts.some((_, i) => excluded.has(parts.slice(0, i + 1).join(".")))
}

export const CHECKLIST_HEADING = "完了条件:"

/** 完了条件 as the notes text of a plan item ("完了条件:\n- a\n- b"); null when empty. */
export function checklistToNotes(checklist: readonly string[] | undefined): string | null {
  const items = (checklist ?? []).map((c) => c.trim()).filter(Boolean)
  return items.length > 0 ? [CHECKLIST_HEADING, ...items.map((c) => `- ${c}`)].join("\n") : null
}

/** The 完了条件 bullets back out of notes written by checklistToNotes (empty when absent). */
export function notesToChecklist(notes: string | null | undefined): string[] {
  const lines = (notes ?? "").split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === CHECKLIST_HEADING)
  if (start < 0) return []
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    const m = /^\s*[-・*]\s*(.+)$/.exec(line)
    if (!m) break
    out.push(m[1].trim())
  }
  return out
}

/** One plan item a template load creates (parents always precede their children). */
export interface ApplyRow {
  path: string
  /** The stage's dependency key (null = takes part in no dependency). */
  key: string | null
  /** Path of the parent row, null = attach under the load's insert position. */
  parentPath: string | null
  name: string
  description: string | null
  notes: string | null
  isMilestone: boolean
  durationDays: number | null
  /** 0-based position among the kept siblings. */
  siblingIndex: number
}

/**
 * Pure: the rows to insert for `nodes` minus the excluded subtrees, parents
 * first. A stage with kept children is never a milestone (a parent's dates
 * are derived from its children).
 */
export function buildApplyRows(nodes: readonly TemplateNode[], excludePaths: readonly string[] = []): ApplyRow[] {
  const excluded = new Set(excludePaths)
  const walk = (list: readonly TemplateNode[], parentPath: string | null): ApplyRow[] => {
    const kept = list.map((node, i) => ({ node, path: parentPath === null ? String(i) : `${parentPath}.${i}` })).filter((k) => !isExcluded(k.path, excluded))
    return kept.flatMap(({ node, path }, siblingIndex) => {
      const children = walk(node.children ?? [], path)
      const row: ApplyRow = {
        path,
        key: node.key ?? null,
        parentPath,
        name: node.name.trim(),
        description: node.description?.trim() || null,
        notes: checklistToNotes(node.checklist),
        isMilestone: children.length === 0 && node.isMilestone === true,
        durationDays: node.durationDays ?? null,
        siblingIndex,
      }
      return [row, ...children]
    })
  }
  return walk(nodes, null)
}
