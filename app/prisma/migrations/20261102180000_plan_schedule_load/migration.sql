-- plan 12 E0: collect what a base-schedule load (POST /plan/load) came from, so finished projects can later be
-- matched item by item to their template and learn from actuals.
--
-- PlanItem.templateKey     key of the schedule / template item a row was created from (null = hand-made / unknown)
-- PlanItem.scheduleLoadId  the load that created the row (SET NULL if the load record is ever removed)
-- plan_schedule_load       one row per load: sourceRef, lineage, sha256 of the canonical content, the content,
--                          start date, skipWeekends, estimateRunId (plan 12 E5), who and when.
--                          UNIQUE (projectId, proposalId): an approved proposal loads once, also under concurrency
--                          (NULL proposalIds do not collide); it also serves lookups by projectId.
--
-- Lock impact (Prisma runs this file in ONE transaction, so every lock below is held until COMMIT):
--   * ALTER TABLE "PlanItem" ADD COLUMN (nullable, no default): metadata-only, but takes ACCESS EXCLUSIVE briefly.
--   * CREATE INDEX "PlanItem_scheduleLoadId_idx": not CONCURRENTLY (impossible inside a transaction) - takes SHARE
--     on "PlanItem" and BLOCKS WRITES to the plan for the duration of the build (one pass over the table).
--   * ADD CONSTRAINT "PlanItem_scheduleLoadId_fkey": takes SHARE ROW EXCLUSIVE on "PlanItem" (writes blocked) and
--     scans every row to validate it (all NULL here, so it is cheap, but it is still a full scan).
-- PlanItem holds master-plan rows (at most 2,000 live rows per project), so this is expected to take seconds - check
-- SELECT count(*) FROM "PlanItem" first and apply in a quiet window anyway (docs/operations/deploy.md section 5f). If PlanItem were ever large, the alternative is a separate
-- migration: ADD CONSTRAINT ... NOT VALID, then ALTER TABLE ... VALIDATE CONSTRAINT (SHARE UPDATE EXCLUSIVE, writes
-- allowed), and CREATE INDEX CONCURRENTLY run outside Prisma's transaction.
-- Append-only: never edit an applied migration, add a new one. (This comment was corrected before the migration
-- was deployed anywhere but disposable test databases.)

-- AlterTable
ALTER TABLE "PlanItem" ADD COLUMN     "scheduleLoadId" TEXT,
ADD COLUMN     "templateKey" VARCHAR(40);

-- CreateTable
CREATE TABLE "plan_schedule_load" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "proposalId" VARCHAR(64),
    "sourceRef" VARCHAR(300),
    "lineage" VARCHAR(200) NOT NULL,
    "scheduleHash" CHAR(64) NOT NULL,
    "content" JSONB NOT NULL,
    "startDate" DATE NOT NULL,
    "skipWeekends" BOOLEAN NOT NULL DEFAULT false,
    "estimateRunId" VARCHAR(191),
    "loadedById" TEXT,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_schedule_load_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_schedule_load_lineage_idx" ON "plan_schedule_load"("lineage");

-- CreateIndex
CREATE UNIQUE INDEX "plan_schedule_load_projectId_proposalId_key" ON "plan_schedule_load"("projectId", "proposalId");

-- CreateIndex
CREATE INDEX "PlanItem_scheduleLoadId_idx" ON "PlanItem"("scheduleLoadId");

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_scheduleLoadId_fkey" FOREIGN KEY ("scheduleLoadId") REFERENCES "plan_schedule_load"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_schedule_load" ADD CONSTRAINT "plan_schedule_load_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

