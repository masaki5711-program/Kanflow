-- Optional GitLab integration per project (off by default).
--
-- Adds:
--   * git_integration  one row per project that opened the settings: enabled
--                      switch, sealed access token (lib/secret-box), auto-complete option.
--   * git_repository   the project's repositories (several allowed), polled by
--                      lib/git/poller — GitLab (Google Cloud) cannot reach the LAN,
--                      so there are no webhooks.
--   * git_link         merge requests / branches / commits naming a PBI (PBI-123),
--                      one row per (repository, object, PBI).
--
-- Purely additive (new empty tables). Projects without a row show no Git UI.
-- Rollback: drop git_link, git_repository, git_integration (in that order).
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand.

-- CreateTable
CREATE TABLE `git_integration` (
    `projectId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `tokenCipher` TEXT NULL,
    `tokenHint` VARCHAR(8) NULL,
    `autoCompleteOnMerge` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`projectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `git_repository` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `webUrl` VARCHAR(1024) NOT NULL,
    `apiBase` VARCHAR(255) NOT NULL,
    `repoPath` VARCHAR(512) NOT NULL,
    `externalId` INTEGER NULL,
    `tokenCipher` TEXT NULL,
    `tokenHint` VARCHAR(8) NULL,
    `syncedAt` DATETIME(3) NULL,
    `syncCursor` DATETIME(3) NULL,
    `lastError` VARCHAR(500) NULL,
    `lastErrorAt` DATETIME(3) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `git_repository_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `git_link` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `repositoryId` VARCHAR(191) NOT NULL,
    `backlogItemId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `ref` VARCHAR(255) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `url` VARCHAR(1024) NOT NULL,
    `state` VARCHAR(16) NULL,
    `pipeline` VARCHAR(24) NULL,
    `author` VARCHAR(191) NULL,
    `sourceBranch` VARCHAR(255) NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `mergedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `git_link_backlogItemId_idx`(`backlogItemId`),
    INDEX `git_link_projectId_occurredAt_idx`(`projectId`, `occurredAt`),
    UNIQUE INDEX `git_link_repositoryId_kind_ref_backlogItemId_key`(`repositoryId`, `kind`, `ref`, `backlogItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `git_integration` ADD CONSTRAINT `git_integration_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `git_repository` ADD CONSTRAINT `git_repository_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `git_link` ADD CONSTRAINT `git_link_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `git_link` ADD CONSTRAINT `git_link_repositoryId_fkey` FOREIGN KEY (`repositoryId`) REFERENCES `git_repository`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `git_link` ADD CONSTRAINT `git_link_backlogItemId_fkey` FOREIGN KEY (`backlogItemId`) REFERENCES `ProductBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

