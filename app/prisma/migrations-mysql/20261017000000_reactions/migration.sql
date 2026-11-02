-- Emoji reactions on team-chat messages, PBI / task / IceBox comments and the
-- completion comment of a sprint task.
--
-- Purely additive: one new table, nothing existing is touched.
-- One row per (target, user, emoji); the target is not a foreign key because it
-- lives in three different tables (the service validates it).
--
-- `emoji` is utf8mb4_bin on purpose: under the table's default utf8mb4_unicode_ci
-- every supplementary-plane character (👍 🎉 😄 🙏 👀 ...) has the same weight, so
-- the unique index below would treat them as one emoji and a user could hold only
-- one reaction per target (verified on MySQL 8.4). prisma migrate diff does not
-- compare collations, so schema.prisma needs no matching attribute.
--
-- Rollback: DROP TABLE `reaction`;

-- CreateTable
CREATE TABLE `reaction` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(32) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reaction_projectId_targetType_targetId_idx`(`projectId`, `targetType`, `targetId`),
    UNIQUE INDEX `reaction_targetType_targetId_userId_emoji_key`(`targetType`, `targetId`, `userId`, `emoji`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reaction` ADD CONSTRAINT `reaction_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reaction` ADD CONSTRAINT `reaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
