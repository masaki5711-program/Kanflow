-- 改善成果ボード (improvement results board) for process_improvement projects.
--
-- Extends the release backlog instead of forking it, so imported items, the
-- PBI link and the existing fields (展開日 = releaseDate, 標準書リンク =
-- manualLink, 改善オーナーメモ = poNote) are reused by the new board:
--   * ReleaseBacklogItem  + metricCategory / metricName / metricUnit / direction,
--                         baselineValue / targetValue / resultValue (Before → After),
--                         annualEffectYen, kaizenStage, standardizedAt.
--                         Software / general projects never read these columns.
--   * improvement_rollout 横展開先 (other lines / plants), FK cascade.
--   * improvement_check   定着確認 (1 / 3 months after 展開日, or custom), FK cascade;
--                         notifiedAt = PO reminder sent (worker collab-daily).
--   * improvement_photo   before / after photos, stored like pbi_attachment
--                         (private/uploads/<projectId>/<fileName>), counted in
--                         the project storage quota.
--
-- Data backfill (process_improvement projects ONLY; existing columns untouched,
-- so the release screen of every other project type is unaffected):
--   status released + 標準書リンク set → kaizenStage "standardized", standardizedAt = releaseDate (else updatedAt)
--   status released (no link)         → "deploying"
--   status deferred                   → "deferred"
--   staged / ready / anything else    → "measuring" (the column default)
--   Released rows with a 展開日 get their 1-month and 3-month 定着確認 rows;
--   checks already past due are created with notifiedAt = now so the first
--   reminder run does not flood the POs with months-old checks.
--
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand;
-- the backfill statements at the end are hand-written.
--
-- Rollback: drop improvement_photo, improvement_check, improvement_rollout,
-- then drop the ten added ReleaseBacklogItem columns (annualEffectYen,
-- baselineValue, direction, kaizenStage, metricCategory, metricName,
-- metricUnit, resultValue, standardizedAt, targetValue). Uploaded photo files
-- stay under private/uploads until the project is purged.

-- AlterTable
ALTER TABLE `ReleaseBacklogItem` ADD COLUMN `annualEffectYen` INTEGER NULL,
    ADD COLUMN `baselineValue` DOUBLE NULL,
    ADD COLUMN `direction` VARCHAR(10) NOT NULL DEFAULT 'decrease',
    ADD COLUMN `kaizenStage` VARCHAR(20) NOT NULL DEFAULT 'measuring',
    ADD COLUMN `metricCategory` VARCHAR(20) NULL,
    ADD COLUMN `metricName` VARCHAR(200) NULL,
    ADD COLUMN `metricUnit` VARCHAR(20) NULL,
    ADD COLUMN `resultValue` DOUBLE NULL,
    ADD COLUMN `standardizedAt` DATETIME(3) NULL,
    ADD COLUMN `targetValue` DOUBLE NULL;

-- CreateTable
CREATE TABLE `improvement_rollout` (
    `id` VARCHAR(191) NOT NULL,
    `releaseItemId` VARCHAR(191) NOT NULL,
    `targetName` VARCHAR(200) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'todo',
    `doneAt` DATETIME(3) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `improvement_rollout_releaseItemId_sortOrder_idx`(`releaseItemId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `improvement_check` (
    `id` VARCHAR(191) NOT NULL,
    `releaseItemId` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `checkedAt` DATETIME(3) NULL,
    `result` VARCHAR(10) NULL,
    `note` TEXT NULL,
    `checkedById` VARCHAR(191) NULL,
    `checkedByName` VARCHAR(191) NULL,
    `notifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `improvement_check_releaseItemId_idx`(`releaseItemId`),
    INDEX `improvement_check_dueDate_checkedAt_notifiedAt_idx`(`dueDate`, `checkedAt`, `notifiedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `improvement_photo` (
    `id` VARCHAR(191) NOT NULL,
    `releaseItemId` VARCHAR(191) NOT NULL,
    `phase` VARCHAR(10) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `improvement_photo_releaseItemId_phase_idx`(`releaseItemId`, `phase`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `improvement_rollout` ADD CONSTRAINT `improvement_rollout_releaseItemId_fkey` FOREIGN KEY (`releaseItemId`) REFERENCES `ReleaseBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `improvement_check` ADD CONSTRAINT `improvement_check_releaseItemId_fkey` FOREIGN KEY (`releaseItemId`) REFERENCES `ReleaseBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `improvement_photo` ADD CONSTRAINT `improvement_photo_releaseItemId_fkey` FOREIGN KEY (`releaseItemId`) REFERENCES `ReleaseBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: kaizenStage of existing process_improvement release items.
UPDATE `ReleaseBacklogItem` r
  JOIN `Project` p ON p.`id` = r.`projectId`
   SET r.`kaizenStage` = CASE
         WHEN r.`status` = 'released' AND r.`manualLink` IS NOT NULL AND TRIM(r.`manualLink`) <> '' THEN 'standardized'
         WHEN r.`status` = 'released' THEN 'deploying'
         WHEN r.`status` = 'deferred' THEN 'deferred'
         ELSE 'measuring'
       END,
       r.`standardizedAt` = CASE
         WHEN r.`status` = 'released' AND r.`manualLink` IS NOT NULL AND TRIM(r.`manualLink`) <> '' THEN COALESCE(r.`releaseDate`, r.`updatedAt`)
         ELSE NULL
       END
 WHERE p.`projectType` = 'process_improvement';

-- Backfill: 1-month / 3-month 定着確認 for released process_improvement items with a 展開日.
INSERT INTO `improvement_check` (`id`, `releaseItemId`, `dueDate`, `kind`, `notifiedAt`, `createdAt`, `updatedAt`)
SELECT CONCAT('kzc', REPLACE(UUID(), '-', '')), r.`id`,
       DATE_ADD(r.`releaseDate`, INTERVAL k.`months` MONTH), k.`kind`,
       CASE WHEN DATE_ADD(r.`releaseDate`, INTERVAL k.`months` MONTH) < CURRENT_TIMESTAMP(3) THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
       CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
  FROM `ReleaseBacklogItem` r
  JOIN `Project` p ON p.`id` = r.`projectId`
 CROSS JOIN (SELECT '1m' AS `kind`, 1 AS `months` UNION ALL SELECT '3m', 3) k
 WHERE p.`projectType` = 'process_improvement'
   AND r.`status` = 'released'
   AND r.`releaseDate` IS NOT NULL;
