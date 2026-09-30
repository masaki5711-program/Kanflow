-- P3 AI extensions (docs/roadmap.md, phase P3).
--
-- Adds:
--   * Project.surveillanceSettings  per-project AI surveillance thresholds
--                                   (JSON string; NULL = built-in defaults)
--   * ChatThread / ChatMessage      persisted project chat history, private to
--                                   the owner; soft delete (deletedAt), purged
--                                   by the worker (30 days after deletion /
--                                   CHAT_RETENTION_DAYS of inactivity)
--   * AiJob                         queue for long-running AI reports (progress
--                                   report, sprint completion review), run by
--                                   the worker or in-process. UNIQUE(activeKey)
--                                   = one queued/running job per project + kind
--                                   (NULL keys never collide once finished)
--
-- Purely additive: one NULL-able column on Project (ALGORITHM=INSTANT on
-- MySQL 8.0.29+) and three new tables. No existing row is rewritten. New
-- tables use utf8mb4 / utf8mb4_unicode_ci like every existing table, so the
-- foreign keys to Project.id / User.id (VARCHAR(191)) are compatible.
--
-- Generated with
--   prisma migrate diff --from-schema <pre-P3 schema> --to-schema prisma/schema.prisma --script
-- (schema-to-schema, no database access) and reviewed by hand.
--
-- Rollback (only if nothing depends on the new data yet): remove the tables
-- ChatMessage, ChatThread and AiJob (in that order), then the column
-- Project.surveillanceSettings.
-- AlterTable
ALTER TABLE `Project` ADD COLUMN `surveillanceSettings` TEXT NULL;

-- CreateTable
CREATE TABLE `ChatThread` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `ChatThread_projectId_userId_deletedAt_updatedAt_idx`(`projectId`, `userId`, `deletedAt`, `updatedAt`),
    INDEX `ChatThread_deletedAt_idx`(`deletedAt`),
    INDEX `ChatThread_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `toolEvents` TEXT NULL,
    `partial` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_threadId_createdAt_idx`(`threadId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiJob` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `kind` VARCHAR(32) NOT NULL,
    `params` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'queued',
    `progress` INTEGER NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `activeKey` VARCHAR(191) NULL,
    `resultReportId` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,

    UNIQUE INDEX `AiJob_activeKey_key`(`activeKey`),
    INDEX `AiJob_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `AiJob_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `AiJob_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatThread` ADD CONSTRAINT `ChatThread_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatThread` ADD CONSTRAINT `ChatThread_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ChatThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiJob` ADD CONSTRAINT `AiJob_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiJob` ADD CONSTRAINT `AiJob_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

