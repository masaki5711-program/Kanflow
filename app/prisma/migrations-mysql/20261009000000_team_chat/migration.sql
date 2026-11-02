-- Project-wide team chat (チームチャット).
--
-- Adds:
--   * TeamMessage            chat message (body) or mirror of a PBI / sprint-task /
--                            IceBox comment (commentId UNIQUE, body NULL, FK Comment
--                            ON DELETE CASCADE); replyToId (self FK, ON DELETE SET NULL)
--   * TeamMessageAttachment  files of a message (stored like project attachments)
--   * TeamMessageMention     @mentions of chat messages
--   * TeamChatRead           per user + project: when the chat was last read
--
-- Data (additive): every live comment gets its mirror row so the chat shows
-- the project's existing conversation from day one. Mirror ids are 'm' + the
-- comment id (comment ids are cuids, so no collision with app-generated ids).
-- The INSERT skips comments that already have a mirror, so it is idempotent.
--
-- Generated with prisma migrate diff (schema-to-schema) plus the hand-written
-- backfill. Rollback (chat history is lost; comments are untouched): remove
-- the four tables TeamChatRead, TeamMessageMention, TeamMessageAttachment, TeamMessage.

-- CreateTable
CREATE TABLE `TeamMessage` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `commentId` VARCHAR(191) NULL,
    `replyToId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `TeamMessage_commentId_key`(`commentId`),
    INDEX `TeamMessage_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `TeamMessage_replyToId_idx`(`replyToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamMessageAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TeamMessageAttachment_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamMessageMention` (
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `TeamMessageMention_userId_idx`(`userId`),
    PRIMARY KEY (`messageId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamChatRead` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `lastReadAt` DATETIME(3) NOT NULL,

    INDEX `TeamChatRead_projectId_idx`(`projectId`),
    UNIQUE INDEX `TeamChatRead_userId_projectId_key`(`userId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TeamMessage` ADD CONSTRAINT `TeamMessage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMessage` ADD CONSTRAINT `TeamMessage_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMessage` ADD CONSTRAINT `TeamMessage_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `Comment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMessage` ADD CONSTRAINT `TeamMessage_replyToId_fkey` FOREIGN KEY (`replyToId`) REFERENCES `TeamMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMessageAttachment` ADD CONSTRAINT `TeamMessageAttachment_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `TeamMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMessageMention` ADD CONSTRAINT `TeamMessageMention_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `TeamMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMessageMention` ADD CONSTRAINT `TeamMessageMention_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamChatRead` ADD CONSTRAINT `TeamChatRead_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamChatRead` ADD CONSTRAINT `TeamChatRead_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: mirror every live comment into the team chat.
INSERT INTO `TeamMessage` (`id`, `projectId`, `authorId`, `body`, `commentId`, `replyToId`, `createdAt`, `deletedAt`)
SELECT CONCAT('m', c.`id`), c.`projectId`, c.`authorId`, NULL, c.`id`, NULL, c.`createdAt`, NULL
FROM `Comment` c
WHERE c.`deletedAt` IS NULL
  AND NOT EXISTS (SELECT 1 FROM `TeamMessage` t WHERE t.`commentId` = c.`id`);
