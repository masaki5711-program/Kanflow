-- AlterTable
ALTER TABLE `ProjectAttachment` ADD COLUMN `folderId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `AttachmentFolder` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AttachmentFolder_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ProjectAttachment_folderId_idx` ON `ProjectAttachment`(`folderId`);

-- AddForeignKey
ALTER TABLE `AttachmentFolder` ADD CONSTRAINT `AttachmentFolder_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAttachment` ADD CONSTRAINT `ProjectAttachment_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `AttachmentFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
