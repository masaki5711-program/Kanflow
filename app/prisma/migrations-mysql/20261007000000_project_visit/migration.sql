-- Project updates: when each user last confirmed a project's updates.
--
-- Adds ProjectVisit (userId, projectId, lastSeenAt), UNIQUE(userId, projectId),
-- FKs to User / Project ON DELETE CASCADE. Activity by other users after
-- lastSeenAt is shown as new (dashboard panel, top-page badges, sidebar dot).
--
-- Purely additive: one new table, no existing table or row is touched.
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand.
--
-- Rollback (users see everything as new again): remove the table ProjectVisit.

-- CreateTable
CREATE TABLE `ProjectVisit` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,

    INDEX `ProjectVisit_projectId_idx`(`projectId`),
    UNIQUE INDEX `ProjectVisit_userId_projectId_key`(`userId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectVisit` ADD CONSTRAINT `ProjectVisit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectVisit` ADD CONSTRAINT `ProjectVisit_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

