/**
 * Backfill of PlanItem.templateKey for plan rows created by a plan-template load (PlanTemplateApplication,
 * whose content snapshot is stored) before plan 12 E0 started writing the key. Pure; the script
 * `scripts/backfill-plan-template-keys.ts` reads the rows and writes the result.
 *
 * Matching is by tree position + name, and only when it is unambiguous:
 *  - the load's top rows (rows whose parent is not a row of the same load) are matched against the
 *    template's top stages; a matched row's children against that stage's children, and so on;
 *  - a row matches a stage when its trimmed name equals the stage's trimmed name AND that name occurs exactly
 *    once among the template's siblings AND exactly once among the rows' siblings;
 *  - anything else (duplicate names, a renamed row, a row under an unmatched parent) stays null.
 * Sibling order is not used: rows may have been reordered since the load, and a template load may have
 * excluded stages (the exclusions are not stored), so positions by index are not trustworthy.
 *
 * The key written is the stage's own `key`, or — for a stage without one (keys are optional in templates) —
 * its positional key `_pos-<path>` (path of sibling indexes in the template, e.g. `_pos-0-2-1`). A positional
 * key that equals an explicit key elsewhere in the template is ambiguous and stays null.
 * A positional key is only comparable within one templateApplicationId (one template snapshot): a later version
 * of the template can put a different stage at the same path. Stages with their own `key` are comparable across
 * versions. Rows that already
 * have a key are never changed (a second run writes nothing).
 */
import type { PlanTemplateContent, TemplateNode } from "@/lib/plan-templates/schema"

export interface BackfillRow {
  id: string
  parentId: string | null
  name: string
  templateKey: string | null
}

export interface BackfillCounts {
  /** Rows given a key by this run. */
  matched: number
  /** Rows whose name is duplicated among the template's or the rows' siblings, or whose key would collide. */
  ambiguous: number
  /** Rows with no stage of that name, or under a parent that did not match. */
  unmatched: number
  /** Rows that already had a key (left as they are). */
  alreadySet: number
}

export interface BackfillPlan {
  updates: { id: string; templateKey: string }[]
  counts: BackfillCounts
}

/** The key of a stage that has none of its own: its sibling-index path in the template ("0.2.1" → "_pos-0-2-1"). */
export function positionalKey(path: string): string {
  return `_pos-${path.replace(/\./g, "-")}`
}

const norm = (name: string) => name.trim()

function explicitKeys(nodes: readonly TemplateNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.key) out.add(n.key)
    explicitKeys(n.children ?? [], out)
  }
  return out
}

export function planTemplateKeyBackfill(content: PlanTemplateContent, rows: readonly BackfillRow[]): BackfillPlan {
  const ids = new Set(rows.map((r) => r.id))
  const childrenOf = new Map<string | null, BackfillRow[]>()
  for (const r of rows) {
    const parent = r.parentId !== null && ids.has(r.parentId) ? r.parentId : null
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), r])
  }
  const explicit = explicitKeys(content.stages)
  const updates: { id: string; templateKey: string }[] = []
  const counts: BackfillCounts = { matched: 0, ambiguous: 0, unmatched: 0, alreadySet: 0 }

  const countSubtree = (row: BackfillRow, outcome: "ambiguous" | "unmatched") => {
    if (row.templateKey !== null) counts.alreadySet += 1
    else counts[outcome] += 1
    for (const child of childrenOf.get(row.id) ?? []) countSubtree(child, "unmatched")
  }

  const walk = (stages: readonly TemplateNode[], parentPath: string | null, siblings: readonly BackfillRow[]) => {
    const stageByName = new Map<string, { node: TemplateNode; path: string }[]>()
    stages.forEach((node, i) => {
      const path = parentPath === null ? String(i) : `${parentPath}.${i}`
      stageByName.set(norm(node.name), [...(stageByName.get(norm(node.name)) ?? []), { node, path }])
    })
    const rowsByName = new Map<string, number>()
    for (const r of siblings) rowsByName.set(norm(r.name), (rowsByName.get(norm(r.name)) ?? 0) + 1)

    for (const row of siblings) {
      const candidates = stageByName.get(norm(row.name)) ?? []
      if (candidates.length === 0) {
        countSubtree(row, "unmatched")
        continue
      }
      if (candidates.length > 1 || (rowsByName.get(norm(row.name)) ?? 0) > 1) {
        countSubtree(row, "ambiguous")
        continue
      }
      const { node, path } = candidates[0]
      const key = node.key ?? positionalKey(path)
      if (row.templateKey !== null) counts.alreadySet += 1
      else if (!node.key && explicit.has(key)) counts.ambiguous += 1
      else {
        updates.push({ id: row.id, templateKey: key })
        counts.matched += 1
      }
      walk(node.children ?? [], path, childrenOf.get(row.id) ?? [])
    }
  }

  walk(content.stages, null, childrenOf.get(null) ?? [])
  return { updates, counts }
}
