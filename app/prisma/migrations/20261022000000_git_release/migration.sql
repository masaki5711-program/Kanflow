-- Git tags / releases for the release tab.
--
--   * git_release  one row per (repository, tag): GitLab tag + release info,
--                  matched to release-tab versions by name.
--
-- Purely additive (new empty table). Projects without Git show nothing new.
-- Rollback: DROP TABLE `git_release`.

-- CreateTable
CREATE TABLE `git_release` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `repositoryId` VARCHAR(191) NOT NULL,
    `tag` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `url` VARCHAR(1024) NOT NULL,
    `releasedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `git_release_projectId_releasedAt_idx`(`projectId`, `releasedAt`),
    UNIQUE INDEX `git_release_repositoryId_tag_key`(`repositoryId`, `tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `git_release` ADD CONSTRAINT `git_release_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `git_release` ADD CONSTRAINT `git_release_repositoryId_fkey` FOREIGN KEY (`repositoryId`) REFERENCES `git_repository`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
