-- 受入基準 as items with stable ids (W5; docs/api-v1.md "Acceptance criteria", docs/mcp.md):
--
--   * acceptance_criterion   one criterion of a PBI. Display id PBI-<displayId>/AC-<seq>;
--                            `seq` counts up per PBI and is never reused (soft delete keeps
--                            the row; (pbiId, seq) is unique as the backstop of the PBI row
--                            lock that serializes allocation). given / when / then / text
--                            are all optional columns (the service requires one of them).
--                            evidenceKind (W12): test | inspection | measurement | approval.
--
-- ProductBacklogItem.acceptanceCriteria (free text) is NOT touched: it stays readable and is
-- deprecated. Existing text is split into items by scripts/migrate-acceptance-criteria.ts
-- (idempotent, dry run by default).
--
-- Purely additive: one new table. Portable to PostgreSQL as is (Prisma types only).
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand.
-- Rollback:
--   DROP TABLE `acceptance_criterion`;

-- CreateTable
CREATE TABLE `acceptance_criterion` (
    `id` VARCHAR(191) NOT NULL,
    `pbiId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `given` TEXT NULL,
    `when` TEXT NULL,
    `then` TEXT NULL,
    `text` TEXT NULL,
    `evidenceKind` VARCHAR(16) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,

    INDEX `acceptance_criterion_pbiId_deletedAt_idx`(`pbiId`, `deletedAt`),
    UNIQUE INDEX `acceptance_criterion_pbiId_seq_key`(`pbiId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `acceptance_criterion` ADD CONSTRAINT `acceptance_criterion_pbiId_fkey` FOREIGN KEY (`pbiId`) REFERENCES `ProductBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

