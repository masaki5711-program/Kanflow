-- plan 12 §5 / §8 item 6: the backtest on real actuals, and durations from actuals turned on per lineage only after an
-- administrator approved it.
--   plan_estimate_eval.skipped     finished projects of the lineage that could not be scored (shown with n).
--   plan_estimate_eval.inputHash   the learnable snapshots the row was computed from; the gate treats a row whose
--                                  hash is not the current one as outdated (a failed or lost recompute fails closed).
--   plan_estimate_gate_approval    approvals with their history: never deleted, ended by withdrawing, by a backtest
--                                  that no longer passes or by a new method version. At most one active row per
--                                  lineage (UNIQUE NULLS NOT DISTINCT below; Prisma does not model NULLS NOT DISTINCT).
--
-- Lock impact: two nullable columns without defaults on plan_estimate_eval (catalog-only ALTERs, no rewrite; the
-- table is written only by the new backtest, so it is empty or tiny), a CHECK on the new column (every row is NULL),
-- and one new, empty table. Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

ALTER TABLE "plan_estimate_eval" ADD COLUMN "skipped" INTEGER;
ALTER TABLE "plan_estimate_eval" ADD COLUMN "inputHash" CHAR(64);
ALTER TABLE "plan_estimate_eval" ADD CONSTRAINT "plan_estimate_eval_skipped_chk" CHECK ("skipped" IS NULL OR "skipped" >= 0);

-- CreateTable
CREATE TABLE "plan_estimate_gate_approval" (
    "id" TEXT NOT NULL,
    "lineage" VARCHAR(200) NOT NULL,
    "methodVersion" VARCHAR(16) NOT NULL,
    "evalId" VARCHAR(191),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "endReason" VARCHAR(16),

    CONSTRAINT "plan_estimate_gate_approval_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_estimate_gate_approval_values_chk" CHECK (
        char_length("lineage") > 0 AND char_length("methodVersion") > 0
        AND ("endReason" IS NULL OR "endReason" IN ('withdrawn', 'failed', 'method'))
        -- An ended row says why; an active one has no reason.
        AND (("endedAt" IS NULL) = ("endReason" IS NULL))
        AND ("endedAt" IS NULL OR "endedAt" >= "approvedAt")
    )
);

-- CreateIndex
CREATE INDEX "plan_estimate_gate_approval_lineage_approvedAt_idx" ON "plan_estimate_gate_approval"("lineage", "approvedAt" DESC);
-- At most one active (endedAt IS NULL) approval per lineage, as plan_actuals_snapshot_one_current_key does.
CREATE UNIQUE INDEX "plan_estimate_gate_approval_one_active_key" ON "plan_estimate_gate_approval"("lineage", "endedAt") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "plan_estimate_gate_approval" ADD CONSTRAINT "plan_estimate_gate_approval_evalId_fkey" FOREIGN KEY ("evalId") REFERENCES "plan_estimate_eval"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plan_estimate_gate_approval" ADD CONSTRAINT "plan_estimate_gate_approval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plan_estimate_gate_approval" ADD CONSTRAINT "plan_estimate_gate_approval_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
