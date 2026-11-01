import { splitAcceptanceCriteria } from "./acceptance-criteria.split"

/**
 * Pure planning step of the 受入基準 migration (scripts/migrate-acceptance-criteria.ts).
 * A PBI is migrated only when it has NO criterion row at all (deleted ones count): re-running
 * never duplicates, and never brings back what a PO deleted. Its old free text is split
 * (acceptance-criteria.split) and numbered 1..n in order.
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
  stats: { pbisScanned: number; pbisWithText: number; alreadyMigrated: number; migrated: number; split: number; kept: number; items: number }
}

export function planAcceptanceCriteriaBackfill(pbis: readonly BackfillPbi[]): BackfillPlan {
  const inserts: BackfillPlan["inserts"] = []
  const stats = { pbisScanned: pbis.length, pbisWithText: 0, alreadyMigrated: 0, migrated: 0, split: 0, kept: 0, items: 0 }
  for (const pbi of pbis) {
    const items = splitAcceptanceCriteria(pbi.acceptanceCriteria)
    if (items.length === 0) continue
    stats.pbisWithText++
    if (pbi.existingRows > 0) {
      stats.alreadyMigrated++
      continue
    }
    stats.migrated++
    if (items.length > 1) stats.split++
    else stats.kept++
    items.forEach((text, i) => inserts.push({ pbiId: pbi.id, seq: i + 1, text }))
    stats.items += items.length
  }
  return { inserts, stats }
}
