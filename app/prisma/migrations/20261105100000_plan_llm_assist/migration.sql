-- plan 12 E6: LLM assistance for the schedule from actuals.
--   plan_actuals_snapshot.finalizeNote   the note written when the actuals are finalized (a source of rule drafts).
--   plan_rule_draft_job                  one rule-draft request per finalized snapshot, processed by the night batch
--                                        (background priority on the shared Ollama); the drafts it writes are ordinary
--                                        `draft` rows of plan_lesson_rule (createdByKind = 'llm'), confirmed by a PO / SM.
--   plan_estimate_run.llmExplanation*    the explanation text (ja / en / id) of a run and its state. The source ids it
--                                        was written from go to the existing column llmSourceIds.
--
-- Lock impact: nullable columns without defaults on two existing tables (catalog-only ALTERs, no rewrite), CHECKs on
-- those new columns (every existing row is NULL, so the check scan is trivial; the ACCESS EXCLUSIVE locks are held to
-- the end of the migration's transaction, bounded by lock_timeout) and one new, empty table.
-- Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

ALTER TABLE "plan_actuals_snapshot" ADD COLUMN "finalizeNote" TEXT;
ALTER TABLE "plan_actuals_snapshot" ADD CONSTRAINT "plan_actuals_snapshot_finalize_note_len_chk"
    CHECK ("finalizeNote" IS NULL OR char_length("finalizeNote") <= 2000);

ALTER TABLE "plan_estimate_run" ADD COLUMN "llmExplanation" JSONB;
ALTER TABLE "plan_estimate_run" ADD COLUMN "llmExplanationState" VARCHAR(16);
ALTER TABLE "plan_estimate_run" ADD COLUMN "llmExplainedAt" TIMESTAMP(3);
ALTER TABLE "plan_estimate_run" ADD CONSTRAINT "plan_estimate_run_llm_explanation_state_chk"
    CHECK ("llmExplanationState" IS NULL OR "llmExplanationState" IN ('ready', 'failed', 'skipped'));
-- Text only when ready, and always as an object (ja / en / id).
ALTER TABLE "plan_estimate_run" ADD CONSTRAINT "plan_estimate_run_llm_explanation_ready_chk"
    CHECK (("llmExplanation" IS NULL) = ("llmExplanationState" IS DISTINCT FROM 'ready')
           AND ("llmExplanation" IS NULL OR jsonb_typeof("llmExplanation") = 'object'));

-- CreateTable
CREATE TABLE "plan_rule_draft_job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "draftsCreated" INTEGER NOT NULL DEFAULT 0,
    "draftsDropped" INTEGER NOT NULL DEFAULT 0,
    "llmModel" VARCHAR(64),
    "promptVersion" VARCHAR(32),
    "sourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "plan_rule_draft_job_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_rule_draft_job_status_chk" CHECK ("status" IN ('queued', 'running', 'done', 'failed', 'skipped')),
    CONSTRAINT "plan_rule_draft_job_counts_chk" CHECK ("attempts" >= 0 AND "draftsCreated" >= 0 AND "draftsDropped" >= 0)
);

-- One request per finalized snapshot (re-finalizing makes a new snapshot and a new request).
CREATE UNIQUE INDEX "plan_rule_draft_job_snapshotId_key" ON "plan_rule_draft_job"("snapshotId");
CREATE INDEX "plan_rule_draft_job_status_createdAt_idx" ON "plan_rule_draft_job"("status", "createdAt");
CREATE INDEX "plan_rule_draft_job_projectId_idx" ON "plan_rule_draft_job"("projectId");

ALTER TABLE "plan_rule_draft_job" ADD CONSTRAINT "plan_rule_draft_job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_rule_draft_job" ADD CONSTRAINT "plan_rule_draft_job_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "plan_actuals_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
