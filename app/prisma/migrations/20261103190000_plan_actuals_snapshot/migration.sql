-- plan 12 E1: 実績のスナップショット. Frozen actuals of a finished project, written by 実績を確定 (plan.actualsFinalize).
--
-- plan_actuals_snapshot   one per finalization; a re-finalization adds a row and sets supersededAt on the old one
--                         (rows are never rewritten otherwise; includeInLearning is the one audited switch).
-- plan_actuals_item       one per leaf: days, slips, wait gap, on-hold days, owner concurrency (numbers only — no
--                         other project's names), complete = usable for learning.
-- plan_actuals_item_pbi   leaf × PBI: hours / rework / MR set. NOT summed into the leaf: confidentiality is checked at
--                         use time against the CURRENT PBI row (a missing PBI counts as confidential).
-- plan_actuals_item_repo  leaf × PBI × repository (plan 12 §2.4); null = the repository could not be read.
-- project_attribute       設備・工程・タグ as free strings (Q5).
-- git_link                + openedAt / versionCount / additions / deletions (nullable; null = not reported).
--
-- Lock impact: ALTER TABLE "git_link" ADD COLUMN (nullable, no default) is metadata-only but takes ACCESS EXCLUSIVE on
-- git_link briefly — and would queue behind a running Git sync, with every reader queued behind it. lock_timeout makes
-- the migration fail fast instead (re-run it in a quiet moment). The new tables are empty; their FKs validate nothing.
-- One current snapshot per project: UNIQUE NULLS NOT DISTINCT ("projectId", "supersededAt") — Prisma models the plain
-- unique index; NULLS NOT DISTINCT (PostgreSQL 15+) is added here.
-- ON DELETE CASCADE: purging a project removes its snapshots (its learning data goes with it).
-- Append-only: never edit an applied migration, add a new one.

SET LOCAL lock_timeout = '5s';

-- AlterTable
ALTER TABLE "git_link" ADD COLUMN     "additions" INTEGER,
ADD COLUMN     "deletions" INTEGER,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "versionCount" INTEGER;

-- CreateTable
CREATE TABLE "plan_actuals_snapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectType" VARCHAR(40) NOT NULL,
    "lineage" VARCHAR(200) NOT NULL,
    "scheduleLoadId" VARCHAR(191),
    "scheduleHash" CHAR(64),
    "skipWeekends" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" DATE NOT NULL,
    "firstFinalizedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedById" TEXT,
    "repoCount" INTEGER NOT NULL DEFAULT 0,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "includeInLearning" BOOLEAN NOT NULL DEFAULT true,
    "methodVersion" VARCHAR(16) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "plan_actuals_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_actuals_item" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "planItemId" VARCHAR(191) NOT NULL,
    "templateKey" VARCHAR(40),
    "name" VARCHAR(255) NOT NULL,
    "parentKey" VARCHAR(40),
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "role" VARCHAR(32),
    "templateDays" INTEGER,
    "plannedDays" INTEGER,
    "actualDays" INTEGER,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "startSlipDays" INTEGER,
    "endSlipDays" INTEGER,
    "waitGapDays" INTEGER,
    "onHoldDays" INTEGER,
    "ownerId" VARCHAR(191),
    "ownerConcurrentAvg" DOUBLE PRECISION,
    "ownerConcurrentPeak" INTEGER,
    "mergeOrderViolations" INTEGER,

    CONSTRAINT "plan_actuals_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_actuals_item_pbi" (
    "id" TEXT NOT NULL,
    "snapshotItemId" TEXT NOT NULL,
    "backlogItemId" VARCHAR(191) NOT NULL,
    "effortHours" DOUBLE PRECISION,
    "estimatedHours" DOUBLE PRECISION,
    "reworkCount" INTEGER NOT NULL DEFAULT 0,
    "mrSetLeadTimeHours" DOUBLE PRECISION,
    "mrCount" INTEGER,

    CONSTRAINT "plan_actuals_item_pbi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_actuals_item_repo" (
    "id" TEXT NOT NULL,
    "snapshotItemId" TEXT NOT NULL,
    "backlogItemId" VARCHAR(191) NOT NULL,
    "repositoryId" VARCHAR(191) NOT NULL,
    "repositoryRef" VARCHAR(512) NOT NULL,
    "mrCount" INTEGER,
    "leadTimeP50Hours" DOUBLE PRECISION,
    "additions" INTEGER,
    "deletions" INTEGER,
    "versionCount" INTEGER,

    CONSTRAINT "plan_actuals_item_repo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_attribute" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "ref" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_attribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_actuals_snapshot_lineage_supersededAt_idx" ON "plan_actuals_snapshot"("lineage", "supersededAt");

-- CreateIndex
CREATE INDEX "plan_actuals_snapshot_projectType_supersededAt_idx" ON "plan_actuals_snapshot"("projectType", "supersededAt");

-- CreateIndex
CREATE UNIQUE INDEX "plan_actuals_snapshot_one_current_key" ON "plan_actuals_snapshot"("projectId", "supersededAt") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "plan_actuals_item_snapshotId_idx" ON "plan_actuals_item"("snapshotId");

-- CreateIndex
CREATE INDEX "plan_actuals_item_templateKey_idx" ON "plan_actuals_item"("templateKey");

-- CreateIndex
CREATE INDEX "plan_actuals_item_ownerId_idx" ON "plan_actuals_item"("ownerId");

-- CreateIndex
CREATE INDEX "plan_actuals_item_pbi_backlogItemId_idx" ON "plan_actuals_item_pbi"("backlogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_actuals_item_pbi_snapshotItemId_backlogItemId_key" ON "plan_actuals_item_pbi"("snapshotItemId", "backlogItemId");

-- CreateIndex
CREATE INDEX "plan_actuals_item_repo_backlogItemId_idx" ON "plan_actuals_item_repo"("backlogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_actuals_item_repo_snapshotItemId_backlogItemId_reposit_key" ON "plan_actuals_item_repo"("snapshotItemId", "backlogItemId", "repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "project_attribute_projectId_kind_ref_key" ON "project_attribute"("projectId", "kind", "ref");

-- AddForeignKey
ALTER TABLE "plan_actuals_snapshot" ADD CONSTRAINT "plan_actuals_snapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_actuals_item" ADD CONSTRAINT "plan_actuals_item_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "plan_actuals_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_actuals_item_pbi" ADD CONSTRAINT "plan_actuals_item_pbi_snapshotItemId_fkey" FOREIGN KEY ("snapshotItemId") REFERENCES "plan_actuals_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_actuals_item_repo" ADD CONSTRAINT "plan_actuals_item_repo_snapshotItemId_fkey" FOREIGN KEY ("snapshotItemId") REFERENCES "plan_actuals_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_attribute" ADD CONSTRAINT "project_attribute_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Guards the service also enforces (Prisma does not model CHECKs; `migrate diff` ignores them).
ALTER TABLE "project_attribute" ADD CONSTRAINT "project_attribute_kind_chk" CHECK ("kind" IN ('equipment', 'process', 'tag'));
-- Stored trimmed (the API trims), so 'a' and 'a ' can never both exist under the unique key.
ALTER TABLE "project_attribute" ADD CONSTRAINT "project_attribute_ref_chk" CHECK ("ref" = btrim("ref") AND char_length("ref") BETWEEN 1 AND 200);
ALTER TABLE "plan_actuals_snapshot" ADD CONSTRAINT "plan_actuals_snapshot_counts_chk" CHECK ("repoCount" >= 0 AND "issueCount" >= 0 AND "version" >= 0);
ALTER TABLE "plan_actuals_item" ADD CONSTRAINT "plan_actuals_item_days_chk" CHECK (
    ("templateDays" IS NULL OR "templateDays" >= 0) AND ("plannedDays" IS NULL OR "plannedDays" >= 0) AND ("actualDays" IS NULL OR "actualDays" >= 0)
    AND ("waitGapDays" IS NULL OR "waitGapDays" >= 0) AND ("onHoldDays" IS NULL OR "onHoldDays" >= 0)
    AND ("ownerConcurrentAvg" IS NULL OR "ownerConcurrentAvg" >= 0) AND ("ownerConcurrentPeak" IS NULL OR "ownerConcurrentPeak" >= 0)
);
-- A complete leaf has both its baseline and actual days (the learning set never reads one without them).
ALTER TABLE "plan_actuals_item" ADD CONSTRAINT "plan_actuals_item_complete_chk" CHECK (NOT "complete" OR ("actualDays" > 0 AND "plannedDays" > 0));
ALTER TABLE "plan_actuals_item_pbi" ADD CONSTRAINT "plan_actuals_item_pbi_values_chk" CHECK (
    ("effortHours" IS NULL OR "effortHours" >= 0) AND ("estimatedHours" IS NULL OR "estimatedHours" >= 0)
    AND "reworkCount" >= 0 AND ("mrCount" IS NULL OR "mrCount" >= 0) AND ("mrSetLeadTimeHours" IS NULL OR "mrSetLeadTimeHours" >= 0)
);
ALTER TABLE "plan_actuals_item_repo" ADD CONSTRAINT "plan_actuals_item_repo_values_chk" CHECK (
    ("mrCount" IS NULL OR "mrCount" >= 0) AND ("leadTimeP50Hours" IS NULL OR "leadTimeP50Hours" >= 0)
    AND ("additions" IS NULL OR "additions" >= 0) AND ("deletions" IS NULL OR "deletions" >= 0) AND ("versionCount" IS NULL OR "versionCount" >= 0)
);
ALTER TABLE "git_link" ADD CONSTRAINT "git_link_mr_stats_chk" CHECK (
    ("additions" IS NULL OR "additions" >= 0) AND ("deletions" IS NULL OR "deletions" >= 0) AND ("versionCount" IS NULL OR "versionCount" >= 0)
);
