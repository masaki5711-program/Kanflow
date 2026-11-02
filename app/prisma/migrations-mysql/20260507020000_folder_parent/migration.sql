-- AlterTable: AttachmentFolder — add parentId for nested folder hierarchy.
ALTER TABLE `AttachmentFolder` ADD COLUMN `parentId` VARCHAR(191) NULL;
CREATE INDEX `AttachmentFolder_parentId_idx` ON `AttachmentFolder`(`parentId`);
ALTER TABLE `AttachmentFolder` ADD CONSTRAINT `AttachmentFolder_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `AttachmentFolder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
