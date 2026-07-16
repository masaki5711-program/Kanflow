-- AlterTable: DailyScrumNote — add archivedAt for archive flag
ALTER TABLE `DailyScrumNote` ADD COLUMN `archivedAt` DATETIME(3) NULL;
CREATE INDEX `DailyScrumNote_archivedAt_idx` ON `DailyScrumNote`(`archivedAt`);
