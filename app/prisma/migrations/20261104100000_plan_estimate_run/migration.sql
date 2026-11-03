-- plan 12 E5: 計画を作る. plan_estimate_run (one estimate run: template + actuals + confirmed lesson rules + levelling),
-- plan_estimate_feedback (利用者の反応 per leaf), plan_estimate_hidden_state (hidden-source state per aggregation unit,
-- counts only, global) and plan_estimate_eval (backtest per lineage; no row = the per-lineage default stays off).
-- plan_schedule_load.estimateRunId (written null until now) gets its FK; ON DELETE SET NULL keeps the load as history.
--
-- Lock impact: four new, empty tables. The FK on plan_schedule_load takes a brief SHARE ROW EXCLUSIVE lock and checks
-- the existing rows, all of which have estimateRunId NULL (the column was only ever written null), so nothing is read
-- from plan_estimate_run.
-- Append-only: never edit an applied migration, add a new one.

SET lock_timeout = '5s';
-- CreateTable
CREATE TABLE "plan_estimate_run" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "purgeAfter" TIMESTAMP(3) NOT NULL,
    "referenceDate" DATE NOT NULL,
    "startDate" DATE NOT NULL,
    "skipWeekends" BOOLEAN NOT NULL DEFAULT false,
    "lineage" VARCHAR(200) NOT NULL,
    "projectType" VARCHAR(40) NOT NULL,
    "sourceRef" VARCHAR(300),
    "templateHash" CHAR(64) NOT NULL,
    "inputHash" CHAR(64) NOT NULL,
    "methodVersion" VARCHAR(16) NOT NULL,
    "gateOn" BOOLEAN NOT NULL,
    "gateReason" VARCHAR(40),
    "llmModel" VARCHAR(64),
    "promptVersion" VARCHAR(32),
    "llmSourceIds" TEXT[],
    "schedule" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "ownerPlan" JSONB NOT NULL,
    "engineInput" JSONB NOT NULL,

    CONSTRAINT "plan_estimate_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estimate_feedback" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "note" VARCHAR(500),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_estimate_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_estimate_hidden_state" (
    "unitKey" VARCHAR(300) NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_estimate_hidden_state_pkey" PRIMARY KEY ("unitKey")
);

-- CreateTable
CREATE TABLE "plan_estimate_eval" (
    "id" TEXT NOT NULL,
    "lineage" VARCHAR(200) NOT NULL,
    "evaluatedOn" DATE NOT NULL,
    "methodVersion" VARCHAR(16) NOT NULL,
    "n" INTEGER NOT NULL,
    "mape" DOUBLE PRECISION NOT NULL,
    "mapeTemplate" DOUBLE PRECISION NOT NULL,
    "p80Hit" DOUBLE PRECISION NOT NULL,
    "endErrorDays" DOUBLE PRECISION NOT NULL,
    "endErrorTemplateDays" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_estimate_eval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_estimate_run_projectId_createdAt_idx" ON "plan_estimate_run"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "plan_estimate_run_expiresAt_idx" ON "plan_estimate_run"("expiresAt");

-- CreateIndex
CREATE INDEX "plan_estimate_run_purgeAfter_idx" ON "plan_estimate_run"("purgeAfter");

-- CreateIndex
CREATE UNIQUE INDEX "plan_estimate_feedback_runId_key_userId_kind_key" ON "plan_estimate_feedback"("runId", "key", "userId", "kind");

-- CreateIndex
CREATE INDEX "plan_estimate_eval_lineage_evaluatedOn_idx" ON "plan_estimate_eval"("lineage", "evaluatedOn" DESC);

-- AddForeignKey
ALTER TABLE "plan_schedule_load" ADD CONSTRAINT "plan_schedule_load_estimateRunId_fkey" FOREIGN KEY ("estimateRunId") REFERENCES "plan_estimate_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estimate_run" ADD CONSTRAINT "plan_estimate_run_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estimate_run" ADD CONSTRAINT "plan_estimate_run_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estimate_feedback" ADD CONSTRAINT "plan_estimate_feedback_runId_fkey" FOREIGN KEY ("runId") REFERENCES "plan_estimate_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_estimate_feedback" ADD CONSTRAINT "plan_estimate_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guards the service also enforces (Prisma does not model CHECKs; migrate diff ignores them).
ALTER TABLE "plan_estimate_run" ADD CONSTRAINT "plan_estimate_run_lifetime_chk" CHECK ("expiresAt" > "createdAt" AND "purgeAfter" >= "expiresAt");
ALTER TABLE "plan_estimate_run" ADD CONSTRAINT "plan_estimate_run_hash_chk" CHECK ("inputHash" ~ '^[0-9a-f]{64}$' AND "templateHash" ~ '^[0-9a-f]{64}$');
-- The card travels with the chat proposal: it stays far below the 55,000-byte proposal limit whatever the item count.
ALTER TABLE "plan_estimate_run" ADD CONSTRAINT "plan_estimate_run_summary_size_chk" CHECK (pg_column_size("summary") <= 55000);
ALTER TABLE "plan_estimate_run" ADD CONSTRAINT "plan_estimate_run_body_size_chk" CHECK (pg_column_size("schedule") <= 1048576 AND pg_column_size("evidence") <= 4194304 AND pg_column_size("ownerPlan") <= 1048576 AND pg_column_size("engineInput") <= 4194304);
ALTER TABLE "plan_estimate_feedback" ADD CONSTRAINT "plan_estimate_feedback_kind_chk" CHECK ("kind" IN ('too_high', 'too_low', 'rule_not_applicable', 'other'));
ALTER TABLE "plan_estimate_eval" ADD CONSTRAINT "plan_estimate_eval_values_chk" CHECK ("n" >= 0 AND "p80Hit" >= 0 AND "p80Hit" <= 1 AND "mape" >= 0 AND "mapeTemplate" >= 0);
