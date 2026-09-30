-- Baseline for schema drift (2026-09-23).
--
-- These objects were added to schema.prisma and applied to the production
-- database with `prisma db push` (outside migration history). Generated with
--   prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script
-- and verified: production DB -> schema.prisma diff is EMPTY.
--
-- Production (DB already has all of this):  DO NOT deploy - mark it applied:
--   npx prisma migrate resolve --applied 20260923000000_baseline_drift
-- Fresh / CI database: `npx prisma migrate deploy` applies it normally.
-- See docs/operations/deploy.md "Prisma baseline".

-- DropForeignKey
ALTER TABLE `SprintBacklogItem` DROP FOREIGN KEY `SprintBacklogItem_pbItemId_fkey`;

-- AlterTable
ALTER TABLE `ProductBacklogItem` ADD COLUMN `productGoalId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `projectType` VARCHAR(191) NOT NULL DEFAULT 'software';

-- AlterTable
ALTER TABLE `Sprint` ADD COLUMN `retrospectiveMemo` TEXT NULL,
    ADD COLUMN `reviewComment` TEXT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `role` VARCHAR(191) NOT NULL DEFAULT 'member';

-- CreateTable
CREATE TABLE `IceboxAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `iceboxItemId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `IceboxAttachment_iceboxItemId_idx`(`iceboxItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserProjectCategory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT 'gray',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserProjectCategory_userId_idx`(`userId`),
    UNIQUE INDEX `UserProjectCategory_userId_name_key`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserProjectCategoryAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,

    INDEX `UserProjectCategoryAssignment_categoryId_idx`(`categoryId`),
    INDEX `UserProjectCategoryAssignment_projectId_idx`(`projectId`),
    UNIQUE INDEX `UserProjectCategoryAssignment_categoryId_projectId_key`(`categoryId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ProductBacklogItem_productGoalId_idx` ON `ProductBacklogItem`(`productGoalId`);

-- AddForeignKey
ALTER TABLE `IceboxAttachment` ADD CONSTRAINT `IceboxAttachment_iceboxItemId_fkey` FOREIGN KEY (`iceboxItemId`) REFERENCES `IceboxItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductBacklogItem` ADD CONSTRAINT `ProductBacklogItem_productGoalId_fkey` FOREIGN KEY (`productGoalId`) REFERENCES `ProductGoal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SprintBacklogItem` ADD CONSTRAINT `SprintBacklogItem_pbItemId_fkey` FOREIGN KEY (`pbItemId`) REFERENCES `ProductBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProjectCategory` ADD CONSTRAINT `UserProjectCategory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProjectCategoryAssignment` ADD CONSTRAINT `UserProjectCategoryAssignment_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `UserProjectCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProjectCategoryAssignment` ADD CONSTRAINT `UserProjectCategoryAssignment_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

