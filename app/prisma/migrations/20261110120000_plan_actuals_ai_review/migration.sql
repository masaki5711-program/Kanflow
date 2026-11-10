-- Handoff 2026-11-05 "次の案" (1): the local LLM reviews finalized actuals and PROPOSES, per leaf, to exclude it from
-- learning or to treat its overrun as waiting; a PO / SM accepts or rejects each proposal.
--   plan_actuals_item.learningUse      null (as recorded) | excluded | waiting — set only by accepting a proposal
--                                      (audited). The recorded numbers are never rewritten.
--   plan_actuals_review_job            one review request per finalized snapshot, processed by the night batch
--                                      (background priority on the shared Ollama), like plan_rule_draft_job.
--   plan_actuals_review_proposal       at most one proposal per leaf; pending → accepted | rejected | superseded.
--
-- Lock impact: one nullable column without a default on plan_actuals_item (catalog-only ALTER, no rewrite) with a CHECK
-- (every existing row is NULL: a trivial scan under the ACCESS EXCLUSIVE lock, bounded by lock_timeout) and two new,
-- empty tables. Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "plan_actuals_item" ADD COLUMN     "learningUse" VARCHAR(16);

-- CreateTable
CREATE TABLE "plan_actuals_review_job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "proposalsCreated" INTEGER NOT NULL DEFAULT 0,
    "proposalsDropped" INTEGER NOT NULL DEFAULT 0,
    "llmModel" VARCHAR(64),
    "promptVersion" VARCHAR(32),
    "sourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "plan_actuals_review_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_actuals_review_proposal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "snapshotItemId" TEXT NOT NULL,
    "jobId" TEXT,
    "kind" VARCHAR(24) NOT NULL,
    "quote" VARCHAR(1000) NOT NULL,
    "confidence" VARCHAR(8) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 0,
    "llmModel" VARCHAR(64),
    "promptVersion" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "plan_actuals_review_proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_actuals_review_job_snapshotId_key" ON "plan_actuals_review_job"("snapshotId");

-- CreateIndex
CREATE INDEX "plan_actuals_review_job_status_createdAt_idx" ON "plan_actuals_review_job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "plan_actuals_review_job_projectId_idx" ON "plan_actuals_review_job"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_actuals_review_proposal_snapshotItemId_key" ON "plan_actuals_review_proposal"("snapshotItemId");

-- CreateIndex
CREATE INDEX "plan_actuals_review_proposal_projectId_state_idx" ON "plan_actuals_review_proposal"("projectId", "state");

-- CreateIndex
CREATE INDEX "plan_actuals_review_proposal_snapshotId_idx" ON "plan_actuals_review_proposal"("snapshotId");

-- AddForeignKey
ALTER TABLE "plan_actuals_review_job" ADD CONSTRAINT "plan_actuals_review_job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_actuals_review_job" ADD CONSTRAINT "plan_actuals_review_job_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "plan_actuals_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "plan_actuals_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_snapshotItemId_fkey" FOREIGN KEY ("snapshotItemId") REFERENCES "plan_actuals_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "plan_actuals_review_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "plan_actuals_item" ADD CONSTRAINT "plan_actuals_item_learning_use_chk"
    CHECK ("learningUse" IS NULL OR "learningUse" IN ('excluded', 'waiting'));
ALTER TABLE "plan_actuals_review_job" ADD CONSTRAINT "plan_actuals_review_job_status_chk"
    CHECK ("status" IN ('queued', 'running', 'done', 'failed', 'skipped'));
ALTER TABLE "plan_actuals_review_job" ADD CONSTRAINT "plan_actuals_review_job_counts_chk"
    CHECK ("attempts" >= 0 AND "proposalsCreated" >= 0 AND "proposalsDropped" >= 0);
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_kind_chk"
    CHECK ("kind" IN ('exclude_from_learning', 'treat_as_waiting'));
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_confidence_chk"
    CHECK ("confidence" IN ('low', 'medium', 'high'));
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_state_chk"
    CHECK ("state" IN ('pending', 'accepted', 'rejected', 'superseded'));
-- A decided proposal records when (who may later be removed: SET NULL).
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_decided_chk"
    CHECK (("state" IN ('accepted', 'rejected')) <= ("decidedAt" IS NOT NULL));
