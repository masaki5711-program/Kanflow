-- 触る範囲 (touched scope of a work claim, W4; docs/api-v1.md "Development (dev:write)",
-- docs/mcp.md declare_scope):
--
--   * work_claim_scope            the files ('path', relative POSIX) and modules ('module',
--                                 crate / directory names) a claim declared it will touch;
--                                 replaced as a whole, at most 200 rows per claim (enforced
--                                 by the service). No unique index on `value` on purpose:
--                                 values are case-sensitive and deduplicated in the service
--                                 (utf8mb4_unicode_ci would treat 'Src' and 'src' as equal,
--                                 PostgreSQL would not — the behaviour must not depend on
--                                 the database).
--   * git_link.scopeCheckedAt / outsideScopeCount / outsideScopePaths
--                                 MR links only: the sync's last comparison of the MR's
--                                 changed files with that scope ("changes outside the
--                                 declared scope", a warning on the PBI panel; never blocks).
--                                 NULL = never compared (every existing row).
--
-- Purely additive: one new table and nullable columns. Portable to PostgreSQL as is
-- (Prisma types only: VARCHAR, INTEGER, JSON → jsonb, DATETIME(3) → timestamp(3)).
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand.
-- Rollback:
--   DROP TABLE `work_claim_scope`;
--   ALTER TABLE `git_link` DROP COLUMN `outsideScopeCount`, DROP COLUMN `outsideScopePaths`, DROP COLUMN `scopeCheckedAt`;

-- AlterTable
ALTER TABLE `git_link` ADD COLUMN `outsideScopeCount` INTEGER NULL,
    ADD COLUMN `outsideScopePaths` JSON NULL,
    ADD COLUMN `scopeCheckedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `work_claim_scope` (
    `id` VARCHAR(191) NOT NULL,
    `claimId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `value` VARCHAR(300) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `work_claim_scope_claimId_idx`(`claimId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `work_claim_scope` ADD CONSTRAINT `work_claim_scope_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `work_claim`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

