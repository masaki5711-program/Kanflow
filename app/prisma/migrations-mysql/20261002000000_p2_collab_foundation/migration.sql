-- P2 collaboration foundation (docs/roadmap.md, phase P2).
--
-- Adds:
--   * ActivityLog            audit / change history per project
--   * Notification           in-app notifications (dedupeKey makes scheduled
--                            jobs idempotent via UNIQUE(recipientId, dedupeKey);
--                            NULL keys never collide)
--   * NotificationPreference per-user opt-out per type (missing row = enabled)
--   * Comment / CommentMention  comment threads on pbi | sprint_task | icebox
--   * TaskAssignee           normalized sprint-task assignees; backfilled from
--                            SprintBacklogItem.assignee by
--                            scripts/migrate-assignees.ts (run separately,
--                            dry-run first). The legacy column is NOT dropped.
--   * `version` INT DEFAULT 0 (optimistic lock) on ProductBacklogItem,
--     SprintBacklogItem, Sprint, IceboxItem
--   * `deletedAt` / `deletedById` (soft delete / trash) on ProductBacklogItem,
--     IceboxItem, Project, plus indexes for "live rows of a project" queries
--
-- Purely additive: no column is dropped, renamed or retyped, and no existing
-- row is rewritten. New columns are NULL-able or have a constant default, so
-- existing rows read as version = 0 / not deleted. On MySQL 8.0.29+ the
-- ADD COLUMNs run as ALGORITHM=INSTANT; the secondary indexes build online
-- (INPLACE, concurrent DML allowed). New tables use the same
-- utf8mb4 / utf8mb4_unicode_ci as every existing table, so the foreign keys
-- to User.id / Project.id / SprintBacklogItem.id (VARCHAR(191)) are
-- type- and collation-compatible.
--
-- Generated with
--   prisma migrate diff --from-schema <pre-P2 schema> --to-schema prisma/schema.prisma --script
-- (schema-to-schema, no database access) and reviewed by hand.
--
-- Rollback (only if nothing depends on the new data yet): drop the six new
-- tables (TaskAssignee, CommentMention, Comment, NotificationPreference,
-- Notification, ActivityLog — in that order), then the three indexes and the
-- added columns.

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `IceboxItem` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `ProductBacklogItem` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `deletedById` VARCHAR(191) NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Sprint` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `SprintBacklogItem` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(32) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorName` VARCHAR(191) NULL,
    `diff` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `ActivityLog_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
    INDEX `ActivityLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `entityType` VARCHAR(32) NULL,
    `entityId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `payload` TEXT NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_recipientId_readAt_createdAt_idx`(`recipientId`, `readAt`, `createdAt`),
    INDEX `Notification_recipientId_createdAt_idx`(`recipientId`, `createdAt`),
    INDEX `Notification_projectId_idx`(`projectId`),
    UNIQUE INDEX `Notification_recipientId_dedupeKey_key`(`recipientId`, `dedupeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationPreference` (
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`userId`, `type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(32) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `editedAt` DATETIME(3) NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Comment_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
    INDEX `Comment_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `Comment_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommentMention` (
    `commentId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `CommentMention_userId_idx`(`userId`),
    PRIMARY KEY (`commentId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskAssignee` (
    `taskId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskAssignee_userId_idx`(`userId`),
    PRIMARY KEY (`taskId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Project_deletedAt_idx` ON `Project`(`deletedAt`);

-- CreateIndex
CREATE INDEX `IceboxItem_projectId_deletedAt_idx` ON `IceboxItem`(`projectId`, `deletedAt`);

-- CreateIndex
CREATE INDEX `ProductBacklogItem_projectId_deletedAt_idx` ON `ProductBacklogItem`(`projectId`, `deletedAt`);

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationPreference` ADD CONSTRAINT `NotificationPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommentMention` ADD CONSTRAINT `CommentMention_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `Comment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommentMention` ADD CONSTRAINT `CommentMention_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskAssignee` ADD CONSTRAINT `TaskAssignee_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `SprintBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskAssignee` ADD CONSTRAINT `TaskAssignee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

