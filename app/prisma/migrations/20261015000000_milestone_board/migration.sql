-- マイルストーン・検収ボード (general projects): board-only state next to 全体計画.
--
-- The stages are the project's top-level PlanItems (name / dates / status /
-- 完了条件 notes stay there, single source of truth); these tables add:
--   * milestone_board            per-project settings (check 呼び名, 予算 / 推移 on).
--   * milestone_board_seed       marker: a template load's checks / documents
--                                were copied onto the board (lazy, idempotent).
--   * milestone_checklist_state  a ticked 完了条件 of a stage (cascade with the item).
--   * acceptance_check           チェック項目 (検収 / テスト / 評価 …) + result / 立会者.
--   * punch_item / punch_photo   残課題 with photos (files counted in the quota).
--   * handover_document / handover_file  引き渡し資料 checklist with files.
--   * budget_line                予算 plan / actual lines.
--   * milestone_metric / milestone_metric_point  monthly 推移 (長期品質改善).
-- Only new tables: no existing row or column changes.
--
-- Generated with prisma migrate diff (database-to-schema) and reviewed by hand.
--
-- Rollback: delete the stored files referenced by punch_photo / handover_file
-- (private/uploads/<projectId>/<fileName>), then DROP TABLE
-- milestone_metric_point, milestone_metric, budget_line, handover_file,
-- handover_document, punch_photo, punch_item, acceptance_check,
-- milestone_checklist_state, milestone_board_seed, milestone_board.

-- CreateTable
CREATE TABLE `milestone_board` (
    `projectId` VARCHAR(191) NOT NULL,
    `checkLabel` VARCHAR(40) NULL,
    `budgetEnabled` BOOLEAN NOT NULL DEFAULT false,
    `trendEnabled` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`projectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `milestone_board_seed` (
    `applicationId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `seededAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `milestone_board_seed_projectId_idx`(`projectId`),
    PRIMARY KEY (`applicationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `milestone_checklist_state` (
    `id` VARCHAR(191) NOT NULL,
    `planItemId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `checkedById` VARCHAR(191) NULL,
    `checkedByName` VARCHAR(255) NULL,
    `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `milestone_checklist_state_planItemId_label_key`(`planItemId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acceptance_check` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `planItemId` VARCHAR(191) NULL,
    `name` VARCHAR(255) NOT NULL,
    `criterion` TEXT NULL,
    `result` VARCHAR(16) NULL,
    `witness` VARCHAR(255) NULL,
    `checkedAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `recordedById` VARCHAR(191) NULL,
    `recordedByName` VARCHAR(255) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `acceptance_check_projectId_sortOrder_idx`(`projectId`, `sortOrder`),
    INDEX `acceptance_check_planItemId_idx`(`planItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `punch_item` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `planItemId` VARCHAR(191) NULL,
    `title` VARCHAR(255) NOT NULL,
    `detail` TEXT NULL,
    `assigneeId` VARCHAR(191) NULL,
    `assigneeName` VARCHAR(255) NULL,
    `dueDate` DATETIME(3) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `closedAt` DATETIME(3) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdByName` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `punch_item_projectId_status_idx`(`projectId`, `status`),
    INDEX `punch_item_planItemId_idx`(`planItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `punch_photo` (
    `id` VARCHAR(191) NOT NULL,
    `punchItemId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `punch_photo_punchItemId_idx`(`punchItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `handover_document` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `receivedAt` DATETIME(3) NULL,
    `receivedByName` VARCHAR(255) NULL,
    `note` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `handover_document_projectId_sortOrder_idx`(`projectId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `handover_file` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `uploadedByName` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `handover_file_documentId_idx`(`documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_line` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `plannedYen` DOUBLE NULL,
    `actualYen` DOUBLE NULL,
    `note` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `budget_line_projectId_sortOrder_idx`(`projectId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `milestone_metric` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `unit` VARCHAR(20) NULL,
    `direction` VARCHAR(10) NOT NULL DEFAULT 'decrease',
    `baselineValue` DOUBLE NULL,
    `targetValue` DOUBLE NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `milestone_metric_projectId_sortOrder_idx`(`projectId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `milestone_metric_point` (
    `id` VARCHAR(191) NOT NULL,
    `metricId` VARCHAR(191) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `value` DOUBLE NOT NULL,
    `recordedByName` VARCHAR(255) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `milestone_metric_point_metricId_month_key`(`metricId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `milestone_board` ADD CONSTRAINT `milestone_board_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone_board_seed` ADD CONSTRAINT `milestone_board_seed_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `plan_template_application`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone_board_seed` ADD CONSTRAINT `milestone_board_seed_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone_checklist_state` ADD CONSTRAINT `milestone_checklist_state_planItemId_fkey` FOREIGN KEY (`planItemId`) REFERENCES `PlanItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acceptance_check` ADD CONSTRAINT `acceptance_check_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acceptance_check` ADD CONSTRAINT `acceptance_check_planItemId_fkey` FOREIGN KEY (`planItemId`) REFERENCES `PlanItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `punch_item` ADD CONSTRAINT `punch_item_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `punch_item` ADD CONSTRAINT `punch_item_planItemId_fkey` FOREIGN KEY (`planItemId`) REFERENCES `PlanItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `punch_photo` ADD CONSTRAINT `punch_photo_punchItemId_fkey` FOREIGN KEY (`punchItemId`) REFERENCES `punch_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handover_document` ADD CONSTRAINT `handover_document_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handover_file` ADD CONSTRAINT `handover_file_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `handover_document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_line` ADD CONSTRAINT `budget_line_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone_metric` ADD CONSTRAINT `milestone_metric_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone_metric_point` ADD CONSTRAINT `milestone_metric_point_metricId_fkey` FOREIGN KEY (`metricId`) REFERENCES `milestone_metric`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

