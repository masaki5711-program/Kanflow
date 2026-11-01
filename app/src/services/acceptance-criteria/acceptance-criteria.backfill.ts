import { AC_MAX_PER_PBI, AC_TEXT_MAX } from "./acceptance-criteria.schemas"
import { splitAcceptanceCriteria } from "./acceptance-criteria.split"

/**
 * Pure planning step of the 受入基準 migration (scripts/migrate-acceptance-criteria.ts).
 * A PBI is migrated only when it has NO criterion row at all (deleted ones count): re-running
 * never duplicates, and never brings back what a PO deleted. Its old free text is split
 * (acceptance-criteria.split) and numbered 1..n in order.
 *
 * Nothing is cut silently: an item longer than AC_TEXT_MAX is split into continuation items at
 * a line / space boundary (`longSplit` counts the PBIs affected); a PBI that would exceed
 * AC_MAX_PER_PBI items is NOT migrated and is listed in `overLimit` (its old text stays
 * readable; a PO shortens it by hand and re-runs).
 */

export interface BackfillPbi {
  id: string
  displayId: number
  /** Old free-text field (deprecated, never modified). */
  acceptanceCriteria: string | null
  /** Rows already in acceptance_criterion for this PBI, deleted ones included. */
  existingRows: number
}

export interface BackfillPlan {
  inserts: Array<{ pbiId: string; seq: number; text: string }>
  /** PBIs not migrated because they would exceed AC_MAX_PER_PBI items. */
  overLimit: Array<{ pbiId: string; displayId: number; items: number }>
  stats: {
    pbisScanned: number
    pbisWithText: number
    alreadyMigrated: number
    migrated: number
    split: number
    kept: number
    items: number
    /** PBIs skipped for having more than AC_MAX_PER_PBI items. */
    overLimit: number
    /** Migrated PBIs where an over-long item was split into continuation items. */
    longSplit: number
  }
}

/** Pure: `text` in pieces of at most `max` characters, cut at a newline or space when possible; joined they hold all the text. */
export function chunkText(text: string, max: number = AC_TEXT_MAX): string[] {
  const out: string[] = []
  let rest = text
  while (rest.length > max) {
    const window = rest.slice(0, max)
    const cut = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "), window.lastIndexOf("　"))
    const at = cut > max / 2 ? cut : max
    out.push(rest.slice(0, at).trimEnd())
    rest = rest.slice(at).trimStart()
  }
  if (rest) out.push(rest)
  return out
}

export function planAcceptanceCriteriaBackfill(pbis: readonly BackfillPbi[]): BackfillPlan {
  const inserts: BackfillPlan["inserts"] = []
  const overLimit: BackfillPlan["overLimit"] = []
  const stats = { pbisScanned: pbis.length, pbisWithText: 0, alreadyMigrated: 0, migrated: 0, split: 0, kept: 0, items: 0, overLimit: 0, longSplit: 0 }
  for (const pbi of pbis) {
    const parts = splitAcceptanceCriteria(pbi.acceptanceCriteria)
    if (parts.length === 0) continue
    stats.pbisWithText++
    if (pbi.existingRows > 0) {
      stats.alreadyMigrated++
      continue
    }
    const items = parts.flatMap((p) => chunkText(p))
    if (items.length > AC_MAX_PER_PBI) {
      stats.overLimit++
      overLimit.push({ pbiId: pbi.id, displayId: pbi.displayId, items: items.length })
      continue
    }
    stats.migrated++
    if (items.length > parts.length) stats.longSplit++
    if (parts.length > 1) stats.split++
    else stats.kept++
    items.forEach((text, i) => inserts.push({ pbiId: pbi.id, seq: i + 1, text }))
    stats.items += items.length
  }
  return { inserts, overLimit, stats }
}
