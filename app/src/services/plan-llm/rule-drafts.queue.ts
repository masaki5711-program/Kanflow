/**
 * The queue of E6 rule-draft requests (plan_rule_draft_job): one per finalized snapshot, written in the finalize
 * transaction, processed by the worker's night batch (./rule-drafts.service.ts).
 */
import type { Db } from "@/services/_shared/db"

/** Queue rule drafts for a newly finalized snapshot (inside the finalize transaction: no snapshot, no request). */
export async function enqueueRuleDrafts(tx: Db, projectId: string, snapshotId: string): Promise<void> {
  await tx.planRuleDraftJob.create({ data: { projectId, snapshotId } })
}
