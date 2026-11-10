-- AI review of actuals, independent review fixes:
--   plan_actuals_item.notes                     the plan row's description / notes AS FINALIZED (the review reads and
--                                               quotes this, never the live plan row, which stays editable).
--   plan_actuals_review_job.proposalsCapped     valid proposals not written because of the per-project cap.
--   plan_actuals_review_proposal.quoteSource    item | note — where the quote is from.
--   plan_actuals_review_proposal.state          + expired (pending for 90 days).
--
-- Lock impact: a nullable column without a default (catalog-only) and two columns with constant defaults (catalog-only
-- since PostgreSQL 11, no rewrite) on existing tables, CHECKs whose scan is trivial (the review tables are new and
-- small), held to the end of the migration's transaction, bounded by lock_timeout. Append-only.

SET lock_timeout = '5s';

ALTER TABLE "plan_actuals_item" ADD COLUMN     "notes" TEXT;
ALTER TABLE "plan_actuals_item" ADD CONSTRAINT "plan_actuals_item_notes_len_chk"
    CHECK ("notes" IS NULL OR char_length("notes") <= 1000);

ALTER TABLE "plan_actuals_review_job" ADD COLUMN     "proposalsCapped" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plan_actuals_review_job" ADD CONSTRAINT "plan_actuals_review_job_capped_chk" CHECK ("proposalsCapped" >= 0);

ALTER TABLE "plan_actuals_review_proposal" ADD COLUMN     "quoteSource" VARCHAR(8) NOT NULL DEFAULT 'item';
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_quote_source_chk"
    CHECK ("quoteSource" IN ('item', 'note'));

ALTER TABLE "plan_actuals_review_proposal" DROP CONSTRAINT "plan_actuals_review_proposal_state_chk";
ALTER TABLE "plan_actuals_review_proposal" ADD CONSTRAINT "plan_actuals_review_proposal_state_chk"
    CHECK ("state" IN ('pending', 'accepted', 'rejected', 'superseded', 'expired'));
