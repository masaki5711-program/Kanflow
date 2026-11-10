/**
 * The queue of AI actuals-review requests (plan_actuals_review_job): one per finalized snapshot, written in the finalize
 * transaction, processed by the night batch (./actuals-review.service.ts).
 */
import type { Db } from "@/services/_shared/db"

/**
 * Queue the review of a newly finalized snapshot (inside the finalize transaction: no snapshot, no request). The pending
 * proposals of the snapshot it replaces are superseded: only the current snapshot is learned from or decided on.
 */
export async function enqueueActualsReview(tx: Db, projectId: string, snapshotId: string, supersedes: string | null): Promise<void> {
  if (supersedes) await tx.planActualsReviewProposal.updateMany({ where: { snapshotId: supersedes, state: "pending" }, data: { state: "superseded" } })
  await tx.planActualsReviewJob.create({ data: { projectId, snapshotId } })
}
