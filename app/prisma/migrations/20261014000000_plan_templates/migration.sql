-- Plan templates (計画テンプレート) and undated plan items (日程未定).
--
--   * PlanItem.plannedStart / plannedEnd become nullable: a stage loaded from
--     a template has no dates until someone sets them (or runs 「日程を仮置き」).
--     Existing rows keep their dates (MODIFY ... NULL changes no data).
--   * PlanItem.durationDays          目安期間 copied from the template stage.
--   * PlanItem.templateApplicationId the load that created the row (SET NULL).
--   * plan_template            editable templates; builtinKey = shipped 共通
--                              template (rows are seeded lazily by the app).
--   * plan_template_revision   edit history snapshots (cascade).
--   * plan_template_application one load into a project (duplicate warning,
--                              content snapshot for the 検収 board).
--
-- Generated with prisma migrate diff (database-to-schema) and reviewed by hand.
--
-- Rollback: drop plan_template_application, plan_template_revision,
-- plan_template (after dropping the PlanItem FK), drop PlanItem.durationDays /
-- templateApplicationId, give undated rows a date, then MODIFY plannedStart /
-- plannedEnd back to DATETIME(3) NOT NULL.

-- AlterTable
ALTER TABLE `PlanItem` ADD COLUMN `durationDays` INTEGER NULL,
    ADD COLUMN `templateApplicationId` VARCHAR(191) NULL,
    MODIFY `plannedStart` DATETIME(3) NULL,
    MODIFY `plannedEnd` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `plan_template` (
    `id` VARCHAR(191) NOT NULL,
    `builtinKey` VARCHAR(40) NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `visibility` VARCHAR(10) NOT NULL DEFAULT 'public',
    `ownerId` VARCHAR(191) NULL,
    `ownerName` VARCHAR(255) NULL,
    `content` MEDIUMTEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedByName` VARCHAR(255) NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `plan_template_builtinKey_key`(`builtinKey`),
    INDEX `plan_template_deletedAt_visibility_idx`(`deletedAt`, `visibility`),
    INDEX `plan_template_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_template_revision` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `visibility` VARCHAR(10) NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `editedById` VARCHAR(191) NULL,
    `editedByName` VARCHAR(255) NULL,
    `editedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `plan_template_revision_templateId_editedAt_idx`(`templateId`, `editedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan_template_application` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `templateName` VARCHAR(255) NOT NULL,
    `templateVersion` INTEGER NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `createdRootIds` TEXT NOT NULL,
    `appliedById` VARCHAR(191) NULL,
    `appliedByName` VARCHAR(255) NULL,
    `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `plan_template_application_projectId_templateId_idx`(`projectId`, `templateId`),
    INDEX `plan_template_application_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `PlanItem_templateApplicationId_idx` ON `PlanItem`(`templateApplicationId`);

-- AddForeignKey
ALTER TABLE `PlanItem` ADD CONSTRAINT `PlanItem_templateApplicationId_fkey` FOREIGN KEY (`templateApplicationId`) REFERENCES `plan_template_application`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_template_revision` ADD CONSTRAINT `plan_template_revision_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `plan_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_template_application` ADD CONSTRAINT `plan_template_application_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plan_template_application` ADD CONSTRAINT `plan_template_application_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `plan_template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

