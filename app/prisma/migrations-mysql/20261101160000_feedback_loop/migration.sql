-- フィードバックの輪 (feedback loop, W11; docs/api-v1.md "Feedback", docs/mcp.md report_failure /
-- report_resolution / search_lessons):
--
--   * failure_event       one reported failure (AI session / CI / GitStation / manual): the SHA-256
--                         signature, the redacted normalized text, the redacted excerpt (<= 4 KB).
--                         projectId NULL = outside any project (SET NULL when a project is deleted).
--   * lesson              the lesson learned, state draft | confirmed | systemized | retired,
--                         unique per (signature, scope). preventionProposedAt = the recurrence step
--                         proposed a prevention PBI (once per signature).
--   * lesson_resolution   how a failure was fixed (one per failure event).
--
-- Purely additive: three new tables. Portable to PostgreSQL as is (VARCHAR, TEXT, INTEGER, BOOLEAN,
-- DATETIME(3) -> timestamp(3)); no MySQL-specific features. The unique key (signature, scope) is on
-- lower-case ASCII values (signature = hex, scope normalized in the service), so MySQL's
-- case-insensitive collation and PostgreSQL's case-sensitive one agree.
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand.
-- Rollback:
--   DROP TABLE `lesson_resolution`; DROP TABLE `lesson`; DROP TABLE `failure_event`;
-- CreateTable
CREATE TABLE `failure_event` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `source` VARCHAR(16) NOT NULL,
    `signature` VARCHAR(64) NOT NULL,
    `signatureText` VARCHAR(1000) NOT NULL,
    `tool` VARCHAR(100) NOT NULL,
    `errorCode` VARCHAR(64) NULL,
    `excerpt` TEXT NOT NULL,
    `sessionRef` VARCHAR(100) NULL,
    `branch` VARCHAR(255) NULL,
    `repeatCount` INTEGER NOT NULL DEFAULT 1,
    `reportedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `failure_event_signature_createdAt_idx`(`signature`, `createdAt`),
    INDEX `failure_event_sessionRef_reportedById_createdAt_idx`(`sessionRef`, `reportedById`, `createdAt`),
    INDEX `failure_event_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `failure_event_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson` (
    `id` VARCHAR(191) NOT NULL,
    `signature` VARCHAR(64) NOT NULL,
    `scope` VARCHAR(120) NOT NULL DEFAULT 'global',
    `state` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `symptom` TEXT NOT NULL,
    `cause` TEXT NULL,
    `fix` TEXT NULL,
    `verify` TEXT NULL,
    `evidence` TEXT NULL,
    `errorCode` VARCHAR(64) NULL,
    `confidential` BOOLEAN NOT NULL DEFAULT false,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `resolvedCount` INTEGER NOT NULL DEFAULT 0,
    `lastSeenAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `systemizedRef` VARCHAR(500) NULL,
    `preventionProposedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lesson_state_lastSeenAt_idx`(`state`, `lastSeenAt`),
    INDEX `lesson_scope_idx`(`scope`),
    UNIQUE INDEX `lesson_signature_scope_key`(`signature`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_resolution` (
    `id` VARCHAR(191) NOT NULL,
    `failureEventId` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NOT NULL,
    `diffSummary` TEXT NOT NULL,
    `verifiedCommand` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lesson_resolution_lessonId_createdAt_idx`(`lessonId`, `createdAt`),
    UNIQUE INDEX `lesson_resolution_failureEventId_key`(`failureEventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `failure_event` ADD CONSTRAINT `failure_event_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `failure_event` ADD CONSTRAINT `failure_event_reportedById_fkey` FOREIGN KEY (`reportedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson` ADD CONSTRAINT `lesson_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_resolution` ADD CONSTRAINT `lesson_resolution_failureEventId_fkey` FOREIGN KEY (`failureEventId`) REFERENCES `failure_event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_resolution` ADD CONSTRAINT `lesson_resolution_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `lesson`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

