-- plan 12 §5 / §8 item 6: durations from actuals turn on per lineage only after an administrator approved it.
--   plan_estimate_gate_approval   one row per approved lineage, bound to the estimate method version. The gate
--                                 (services/plan-estimate-run/gate.ts) needs a passing backtest (plan_estimate_eval)
--                                 AND a row here for the current method; deleting the row withdraws the approval.
--
-- Lock impact: one new, empty table; no existing table is touched.
-- Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';

-- CreateTable
CREATE TABLE "plan_estimate_gate_approval" (
    "lineage" VARCHAR(200) NOT NULL,
    "methodVersion" VARCHAR(16) NOT NULL,
    "evalId" VARCHAR(191),
    "approvedById" VARCHAR(191),
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_estimate_gate_approval_pkey" PRIMARY KEY ("lineage")
);
