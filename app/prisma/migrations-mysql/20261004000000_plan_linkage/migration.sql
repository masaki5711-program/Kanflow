-- Master plan (全体計画) overhaul: PBI linkage, dependencies, baseline,
-- owner, optimistic lock and soft delete for PlanItem.
--
-- Schema (additive):
--   * PlanItem: progressMode VARCHAR(16) DEFAULT 'manual' ('manual' | 'linked'),
--     version INT DEFAULT 0 (optimistic lock), baselineStart / baselineEnd,
--     ownerId (FK User, ON DELETE SET NULL), deletedAt / deletedById (trash),
--     indexes (projectId, deletedAt) and (ownerId)
--   * ProductBacklogItem.planItemId (FK PlanItem, ON DELETE SET NULL) + index:
--     a PBI belongs to at most one plan item
--   * PlanItemDependency: finish-to-start links (predecessor → successor),
--     both FKs ON DELETE CASCADE, UNIQUE(predecessorId, successorId)
--
-- Data changes (NOT purely additive — review before deploying):
--   1. status 'delayed' → 'in_progress'. Delay is now computed per request
--      (scheduleState = 'delayed' when plannedEnd < today and not done), so
--      the manual status is retired. The previous value is not kept.
--   2. Plan dates are normalized to date-only (UTC midnight). Rows written
--      with a time part (e.g. JST midnight = 15:00:00 UTC of the previous
--      day) are rounded to the NEAREST UTC midnight — the same rule the API
--      applies when reading (src/lib/plan-progress.ts toDateKey). Rows
--      already at 00:00:00 are untouched, so the UPDATEs are idempotent.
--   Parent progress / status / dates are re-derived by the application
--   (the first GET /plan of each project heals stored rollups).
--
-- New columns are NULL-able or have a constant default (ALGORITHM=INSTANT on
-- MySQL 8.0.29+); indexes build online. FK columns are VARCHAR(191)
-- utf8mb4_unicode_ci like User.id / PlanItem.id.
--
-- Generated with
--   prisma migrate diff --from-schema <pre-change schema> --to-schema prisma/schema.prisma --script
-- (schema-to-schema, no database access), data UPDATEs added by hand.
--
-- Rollback: drop the FKs, PlanItemDependency, ProductBacklogItem.planItemId
-- and the added PlanItem columns / indexes. The 'delayed' status and the
-- original time parts cannot be restored (take a backup first).

-- AlterTable
ALTER TABLE `PlanItem` ADD COLUMN `baselineEnd` DATETIME(3) NULL,
    ADD COLUMN `baselineStart` DATETIME(3) NULL,
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL,
    ADD COLUMN `ownerId` VARCHAR(191) NULL,
    ADD COLUMN `progressMode` VARCHAR(16) NOT NULL DEFAULT 'manual',
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `ProductBacklogItem` ADD COLUMN `planItemId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `PlanItemDependency` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `predecessorId` VARCHAR(191) NOT NULL,
    `successorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlanItemDependency_successorId_idx`(`successorId`),
    INDEX `PlanItemDependency_projectId_idx`(`projectId`),
    UNIQUE INDEX `PlanItemDependency_predecessorId_successorId_key`(`predecessorId`, `successorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `PlanItem_projectId_deletedAt_idx` ON `PlanItem`(`projectId`, `deletedAt`);

-- CreateIndex
CREATE INDEX `PlanItem_ownerId_idx` ON `PlanItem`(`ownerId`);

-- CreateIndex
CREATE INDEX `ProductBacklogItem_planItemId_idx` ON `ProductBacklogItem`(`planItemId`);

-- AddForeignKey
ALTER TABLE `PlanItem` ADD CONSTRAINT `PlanItem_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanItemDependency` ADD CONSTRAINT `PlanItemDependency_predecessorId_fkey` FOREIGN KEY (`predecessorId`) REFERENCES `PlanItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanItemDependency` ADD CONSTRAINT `PlanItemDependency_successorId_fkey` FOREIGN KEY (`successorId`) REFERENCES `PlanItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductBacklogItem` ADD CONSTRAINT `ProductBacklogItem_planItemId_fkey` FOREIGN KEY (`planItemId`) REFERENCES `PlanItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: retire the manual 'delayed' status (delay is computed now).
UPDATE `PlanItem` SET `status` = 'in_progress' WHERE `status` = 'delayed';

-- Data: plan dates → date-only (nearest UTC midnight).
UPDATE `PlanItem` SET `plannedStart` = CAST(DATE(DATE_ADD(`plannedStart`, INTERVAL 12 HOUR)) AS DATETIME(3))
  WHERE TIME(`plannedStart`) <> '00:00:00';
UPDATE `PlanItem` SET `plannedEnd` = CAST(DATE(DATE_ADD(`plannedEnd`, INTERVAL 12 HOUR)) AS DATETIME(3))
  WHERE TIME(`plannedEnd`) <> '00:00:00';
UPDATE `PlanItem` SET `actualStart` = CAST(DATE(DATE_ADD(`actualStart`, INTERVAL 12 HOUR)) AS DATETIME(3))
  WHERE `actualStart` IS NOT NULL AND TIME(`actualStart`) <> '00:00:00';
UPDATE `PlanItem` SET `actualEnd` = CAST(DATE(DATE_ADD(`actualEnd`, INTERVAL 12 HOUR)) AS DATETIME(3))
  WHERE `actualEnd` IS NOT NULL AND TIME(`actualEnd`) <> '00:00:00';
