-- Files and images in a PBI's 参考資料 (reference material) section.
--
-- Adds:
--   * pbi_attachment  files of a PBI, stored like the IceBox attachments
--                     (private/uploads/<projectId>/<fileName>); FK
--                     ProductBacklogItem ON DELETE CASCADE, indexed by the PBI.
--
-- Purely additive (new empty table); existing rows are untouched. A PBI in
-- the trash keeps its attachments; purging it removes the rows (cascade) and
-- the stored files (service, after commit). The files count towards the
-- project storage quota (ATTACHMENT_PROJECT_QUOTA_MB).
-- Generated with prisma migrate diff (schema-to-schema) and reviewed by hand.
--
-- Rollback (uploaded reference files lose their rows; the stored files stay
-- under private/uploads until the project is purged): remove the table
-- pbi_attachment.

-- CreateTable
CREATE TABLE `pbi_attachment` (
    `id` VARCHAR(191) NOT NULL,
    `backlogItemId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pbi_attachment_backlogItemId_idx`(`backlogItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pbi_attachment` ADD CONSTRAINT `pbi_attachment_backlogItemId_fkey` FOREIGN KEY (`backlogItemId`) REFERENCES `ProductBacklogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
