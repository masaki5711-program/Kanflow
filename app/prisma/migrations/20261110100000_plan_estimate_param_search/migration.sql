-- The deterministic parameter search (handoff 2026-11-05 "次の案" (2)): the estimator's settings (outlier MADs,
-- half-life, K, prior spread) are searched by backtest on the recorded actuals and PROPOSED to an administrator, who
-- approves or rejects them. No LLM.
--   plan_estimate_param_proposal   every search result per lineage (a proposal, or "keep the defaults" with why), with
--                                  the lineage-level metrics before / after. Never deleted; decision = approved /
--                                  rejected / superseded (null = pending or a "keep" row).
--   plan_estimate_param_approval   the approved settings per lineage with their history (ended by an administrator,
--                                  a failing backtest, a new method or a newer approval). At most one active row per
--                                  lineage (UNIQUE NULLS NOT DISTINCT below; Prisma does not model NULLS NOT DISTINCT).
--   plan_estimate_eval.paramApprovalId   the settings a backtest row was computed with (null = defaults); the gate
--                                  treats a row of other settings than the active ones as outdated.
--
-- Lock impact: one nullable column without a default on plan_estimate_eval (catalog-only, no rewrite; the table is
-- small) plus its foreign key (validated against an all-NULL column), and two new, empty tables.
-- Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

-- CreateTable
CREATE TABLE "plan_estimate_param_proposal" (
    "id" TEXT NOT NULL,
    "lineage" VARCHAR(200) NOT NULL,
    "methodVersion" VARCHAR(16) NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "outcome" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(24),
    "params" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "candidates" INTEGER NOT NULL,
    "evaluated" INTEGER NOT NULL,
    "timedOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" VARCHAR(16),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "plan_estimate_param_proposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_estimate_param_proposal_values_chk" CHECK (
        char_length("lineage") > 0 AND char_length("methodVersion") > 0
        AND "outcome" IN ('propose', 'keep_default')
        -- A proposal has no reason; "keep the defaults" says why.
        AND (("outcome" = 'propose') = ("reason" IS NULL))
        AND ("reason" IS NULL OR "reason" IN ('not_enough_actuals', 'no_improvement', 'holdout_worse', 'not_passing', 'time_budget'))
        AND "candidates" >= 0 AND "evaluated" >= 0 AND "evaluated" <= "candidates"
        AND jsonb_typeof("params") = 'object' AND jsonb_typeof("metrics") = 'object'
        -- Only a proposal is decided; a decided row has a time.
        AND ("decision" IS NULL OR ("outcome" = 'propose' AND "decision" IN ('approved', 'rejected', 'superseded')))
        AND (("decision" IS NULL) = ("decidedAt" IS NULL))
    )
);

-- CreateTable
CREATE TABLE "plan_estimate_param_approval" (
    "id" TEXT NOT NULL,
    "lineage" VARCHAR(200) NOT NULL,
    "methodVersion" VARCHAR(16) NOT NULL,
    "proposalId" VARCHAR(191),
    "params" JSONB NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "endReason" VARCHAR(16),

    CONSTRAINT "plan_estimate_param_approval_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_estimate_param_approval_values_chk" CHECK (
        char_length("lineage") > 0 AND char_length("methodVersion") > 0
        AND jsonb_typeof("params") = 'object'
        AND ("endReason" IS NULL OR "endReason" IN ('withdrawn', 'failed', 'method', 'replaced'))
        AND (("endedAt" IS NULL) = ("endReason" IS NULL))
        AND ("endedAt" IS NULL OR "endedAt" >= "approvedAt")
    )
);

ALTER TABLE "plan_estimate_eval" ADD COLUMN "paramApprovalId" VARCHAR(191);

-- CreateIndex
CREATE INDEX "plan_estimate_param_proposal_lineage_createdAt_idx" ON "plan_estimate_param_proposal"("lineage", "createdAt" DESC);
CREATE INDEX "plan_estimate_param_approval_lineage_approvedAt_idx" ON "plan_estimate_param_approval"("lineage", "approvedAt" DESC);
-- At most one active (endedAt IS NULL) approval per lineage, as plan_estimate_gate_approval_one_active_key does.
CREATE UNIQUE INDEX "plan_estimate_param_approval_one_active_key" ON "plan_estimate_param_approval"("lineage", "endedAt") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "plan_estimate_eval" ADD CONSTRAINT "plan_estimate_eval_paramApprovalId_fkey" FOREIGN KEY ("paramApprovalId") REFERENCES "plan_estimate_param_approval"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plan_estimate_param_proposal" ADD CONSTRAINT "plan_estimate_param_proposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plan_estimate_param_approval" ADD CONSTRAINT "plan_estimate_param_approval_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "plan_estimate_param_proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plan_estimate_param_approval" ADD CONSTRAINT "plan_estimate_param_approval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plan_estimate_param_approval" ADD CONSTRAINT "plan_estimate_param_approval_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
