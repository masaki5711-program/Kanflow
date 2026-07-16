-- AlterTable: ProjectAttachment — add sortOrder column for drag-reorder support.
ALTER TABLE `ProjectAttachment` ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;
CREATE INDEX `ProjectAttachment_folderId_sortOrder_idx`
  ON `ProjectAttachment`(`folderId`, `sortOrder`);
