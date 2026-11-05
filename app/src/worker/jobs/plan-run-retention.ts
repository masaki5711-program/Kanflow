/**
 * Retention of 計画を作る estimate runs (plan 12 §4 / Q8, decided 2026-11-03: runs and their feedback are kept for one
 * year). Each run carries its own deadline (`purgeAfter` = createdAt + 1 year, set when it is made); this sweep deletes
 * the runs past it in bounded batches. Feedback goes with its run (ON DELETE CASCADE). Part of the daily collab job.
 *
 * Not swept here, on purpose:
 * - plan_estimate_hidden_state: it is what makes a hidden source's change move the shown numbers two at a time
 *   (plan 12 §3.2 rule 2); dropping it would reset that protection. It holds counts only, never a source id.
 * - the actuals snapshots: kept while they are used for learning; people are removed by the audited admin
 *   pseudonymisation (POST /api/admin/plan-actuals/pseudonymize), not by age.
 */
import { defaultDb, type Db } from "@/services/_shared/db"
import { PURGE_BATCH, deleteInBatches } from "./activity-retention"

export interface PlanRunRetentionOptions {
  now?: () => Date
  db?: Db
}

export interface PlanRunRetentionResult {
  estimateRuns: { deleted: number }
}

export async function purgeExpiredEstimateRuns(opts: PlanRunRetentionOptions = {}): Promise<PlanRunRetentionResult> {
  const db = opts.db ?? defaultDb
  const now = (opts.now ?? (() => new Date()))()
  const deleted = await deleteInBatches(
    () => db.planEstimateRun.findMany({ where: { purgeAfter: { lt: now } }, select: { id: true }, take: PURGE_BATCH }),
    (ids) => db.planEstimateRun.deleteMany({ where: { id: { in: ids } } }),
  )
  return { estimateRuns: { deleted } }
}
