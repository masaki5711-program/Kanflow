-- P4: personal access tokens (read-only REST API /api/v1) + metrics snapshots
-- (docs/roadmap.md phase P4, docs/api-v1.md).
--
-- Adds:
--   * ApiToken        personal access tokens. Only the SHA-256 hex of the token
--                     is stored (UNIQUE tokenHash = index lookup, the plain
--                     token is never persisted). FK to User ON DELETE CASCADE.
--   * MetricSnapshot  5-minute snapshots of the in-process request / AI / queue
--                     metrics (JSON in TEXT), pruned after METRICS_RETENTION_DAYS.
--
-- Purely additive: two new tables, no existing table or row is touched. New
-- tables use utf8mb4 / utf8mb4_unicode_ci like every existing table, so the
-- foreign key to User.id (VARCHAR(191)) is compatible.
--
-- Generated with
--   prisma migrate diff --from-schema <pre-P4 schema> --to-schema prisma/schema.prisma --script
-- (schema-to-schema, no database access) and reviewed by hand.
--
-- Rollback (tokens stop working, snapshots are lost): remove the tables
-- ApiToken and MetricSnapshot.
-- CreateTable
CREATE TABLE `ApiToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `prefix` VARCHAR(16) NOT NULL,
    `scopes` VARCHAR(191) NOT NULL,
    `userTokenVersion` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ApiToken_tokenHash_key`(`tokenHash`),
    INDEX `ApiToken_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `ApiToken_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MetricSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `takenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `data` TEXT NOT NULL,

    INDEX `MetricSnapshot_takenAt_idx`(`takenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ApiToken` ADD CONSTRAINT `ApiToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

