import { jsonEqual } from "./equal"
import type { ElementWrite } from "./model"

/**
 * The server's merge rule for element writes (plan §4.3): per element, the higher `version` stays.
 *
 * - no stored row, or the write's version is higher → the write is applied;
 * - same version and the same content → nothing to do (a repeated request whose answer was lost);
 * - otherwise the stored row stays and the write is reported back as stale, with the stored row, so the
 *   writer can decide (the editor re-sends its change on top: the later save wins).
 *
 * Deleting an element nobody stored is nothing to do. Pure: the service reads the stored rows under the
 * sheet's lock, asks this function, and writes what it says.
 */
export interface ExistingElement {
  version: number
  deleted: boolean
  data: unknown
}

export interface MergePlan {
  /** Writes to store, in request order. */
  apply: ElementWrite[]
  /** Ids already stored exactly as sent. */
  unchanged: string[]
  /** Ids whose stored version is not lower than the one sent (and the content differs). */
  stale: string[]
  /** Change of the sheet's live element count when `apply` is stored. */
  liveDelta: number
}

export function planMerge(existing: ReadonlyMap<string, ExistingElement>, writes: readonly ElementWrite[]): MergePlan {
  const plan: MergePlan = { apply: [], unchanged: [], stale: [], liveDelta: 0 }
  for (const write of writes) {
    const stored = existing.get(write.id)
    const deleted = write.deleted === true
    if (!stored) {
      if (deleted) {
        plan.unchanged.push(write.id)
      } else {
        plan.apply.push(write)
        plan.liveDelta += 1
      }
      continue
    }
    if (write.version > stored.version) {
      plan.apply.push(write)
      plan.liveDelta += (deleted ? 0 : 1) - (stored.deleted ? 0 : 1)
      continue
    }
    const same =
      write.version === stored.version &&
      deleted === stored.deleted &&
      (deleted || jsonEqual((write as { data: unknown }).data, stored.data))
    if (same) plan.unchanged.push(write.id)
    else plan.stale.push(write.id)
  }
  return plan
}
