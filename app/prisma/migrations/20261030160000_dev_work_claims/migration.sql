-- Developer writes through the API (K5, scope write:dev; docs/api-v1.md
-- "Development (write:dev)", docs/mcp.md):
--
--   * work_claim            作業の宣言: who works on a PBI (taskId null) or one
--                           of its sprint tasks, from which session, on which
--                           branch. Active = releasedAt IS NULL and heartbeatAt
--                           within DEV_CLAIM_STALE_HOURS; old rows stay as history.
--   * git_link.declaredById / declaredAt
--                           a merge request linked by a developer (POST
--                           .../dev/mr-links) instead of found by the sync;
--                           NULL = found by the sync (every existing row).
--   * Comment.via           'api' / 'mcp' when a comment was posted with an
--                           access token; NULL = the UI (every existing row).
--
-- Purely additive: one new table and nullable columns; nothing existing changes.
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand.
-- Rollback:
--   DROP TABLE `work_claim`;
--   ALTER TABLE `git_link` DROP FOREIGN KEY `git_link_declaredById_fkey`;
--   DROP INDEX `git_link_declaredById_idx` ON `git_link`;
--   ALTER TABLE `git_link` DROP COLUMN `declaredAt`, DROP COLUMN `declaredById`;
--   ALTER TABLE `Comment` DROP COLUMN `via`;

-- AlterTable
ALTER TABLE `Comment` ADD COLUMN `via` VARCHAR(8) NULL;

-- AlterTable
ALTER TABLE `git_link` ADD COLUMN `declaredAt` DATETIME(3) NULL,
    ADD COLUMN `declaredById` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `work_claim` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `backlogItemId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(100) NOT NULL,
    `branch` VARCHAR(255) NULL,
    `heartbeatAt` DATETIME(3) NOT NULL,
    `releasedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `work_claim_projectId_releasedAt_heartbeatAt_idx`(`projectId`, `releasedAt`, `heartbeatAt`),
    INDEX `work_claim_backlogItemId_releasedAt_idx`(`backlogItemId`, `releasedAt`),
    INDEX `work_claim_taskId_idx`(`taskId`),
    INDEX `work_claim_userId_sessionId_idx`(`userId`, `sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `git_link_declaredById_idx` ON `git_link`(`declaredById`);

-- AddForeignKey
ALTER TABLE `git_link` ADD CONSTRAINT `git_link_declaredById_fkey` FOREIGN KEY (`declaredById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_claim` ADD CONSTRAINT `work_claim_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_claim` ADD CONSTRAINT `work_claim_backlogItemId_fkey` FOREIGN KEY (`backlogItemId`) REFERENCES `ProductBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_claim` ADD CONSTRAINT `work_claim_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `SprintBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_claim` ADD CONSTRAINT `work_claim_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

